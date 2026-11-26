/**
 * Minimal `.env` loader: reads KEY=VALUE lines from the current directory and
 * sets them into `process.env` without overriding values already present in
 * the environment. Mirrors the launch-time env layering in the harness, but
 * reduced to a single local file.
 */
import { existsSync, readFileSync } from 'node:fs'

export function loadDotEnv(file = '.env'): void {
  if (!existsSync(file)) return
  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}
