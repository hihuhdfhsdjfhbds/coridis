/**
 * The model-facing `read_file` tool.
 */
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@coridis/tools'

export interface Config {
  maxBytes?: number
}

export const name = 'tool-read-file'

export const inject = ['tools']

interface Args {
  path: string
  offset?: number
  limit?: number
}

export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(() => ctx.tools.register(defineTool<Args, string>({
    name: 'read_file',
    description: 'Read a UTF-8 text file from disk and return its contents.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path to the file.' },
      offset: { type: 'number', description: '1-based line number to start reading from.' },
      limit: { type: 'number', description: 'Maximum number of lines to read.' },
    },
    async execute(args, exec) {
      const maxBytes = config.maxBytes ?? 512_000
      const content = await readFile(args.path, { encoding: 'utf8', signal: exec.signal })
      const sliced = content.length > maxBytes ? `${content.slice(0, maxBytes)}\n…[truncated]` : content
      return applyLines(sliced, args.offset, args.limit)
    },
    render(_args, value) {
      return [{ type: 'text', text: value }]
    },
  })))
}

function applyLines(content: string, offset?: number, limit?: number): string {
  if (offset === undefined && limit === undefined) return content
  const lines = content.split('\n')
  const start = offset === undefined ? 0 : Math.max(0, offset - 1)
  const end = limit === undefined ? lines.length : start + limit
  return lines.slice(start, end).join('\n')
}
