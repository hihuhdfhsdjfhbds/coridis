/**
 * Minimal profile composer and plugin boot.
 *
 * Faithful to the harness's profile → bundle → patch layering, but simplified:
 * it reads a profile's bundles, applies each bundle's `cordis.patch.yml`
 * (`insert`/`config`/`disable` rows), then the profile's own patch, and boots
 * the resulting entry list with `ctx.plugin()`.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, parse as parsePath } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { load as parseYaml } from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'

export interface Entry {
  id?: string
  name: string
  config?: unknown
  disabled?: boolean
}

interface PatchOp {
  insert?: Entry[]
  id?: string
  name?: string
  config?: unknown
  disabled?: boolean
}

const require = createRequire(import.meta.url)

export function resolveProfileDir(name: string): string {
  const home = process.env.CORIDIS_HOME
  if (home) {
    const dir = join(home, 'profiles', name)
    if (existsSync(dir)) return dir
  }
  let current = dirname(fileURLToPath(import.meta.url))
  const root = parsePath(current).root
  while (current !== root) {
    const candidate = join(current, 'profiles', name)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`profile "${name}" not found (set CORIDIS_HOME or run from the repo root)`)
}

function parsePatch(text: string): PatchOp[] {
  const value = parseYaml(text)
  return Array.isArray(value) ? (value as PatchOp[]) : []
}

function applyPatch(entries: Entry[], ops: PatchOp[]): void {
  for (const op of ops) {
    if (op.insert) {
      for (const entry of op.insert) entries.push({ ...entry })
    } else if (op.id) {
      const existing = entries.find(entry => entry.id === op.id)
      if (existing) {
        if (op.name !== undefined) existing.name = op.name
        if (op.config !== undefined) existing.config = op.config
        if (op.disabled !== undefined) existing.disabled = op.disabled
      } else {
        entries.push({ id: op.id, name: op.name ?? op.id, config: op.config, disabled: op.disabled })
      }
    }
  }
}

export async function composeEntries(profileName: string): Promise<Entry[]> {
  const profileDir = resolveProfileDir(profileName)
  const profilePkg = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')) as {
    coridis?: { profile?: { bundles?: string[] } }
  }
  const bundles = profilePkg.coridis?.profile?.bundles ?? []
  const entries: Entry[] = []
  for (const bundle of bundles) {
    const patchPath = require.resolve(`${bundle}/cordis.patch.yml`)
    applyPatch(entries, parsePatch(await readFile(patchPath, 'utf8')))
  }
  const profilePatch = join(profileDir, 'cordis.patch.yml')
  if (existsSync(profilePatch)) {
    applyPatch(entries, parsePatch(await readFile(profilePatch, 'utf8')))
  }
  return entries.filter(entry => !entry.disabled)
}

export async function boot(profileName: string): Promise<Context> {
  const ctx = new Context()
  const entries = await composeEntries(profileName)
  const fibers = entries.map(async (entry) => {
    const module = await import(entry.name)
    const plugin = ((module as { default?: unknown }).default ?? module) as any
    return ctx.plugin(plugin, entry.config)
  })
  await Promise.all(fibers)
  return ctx
}
