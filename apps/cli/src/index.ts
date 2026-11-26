/**
 * The coridis launcher. Owns only what a launcher owns — which profile to boot
 * and the task — then boots the profile tree and drives a command-line chat.
 *
 * Interactive chat is the default; a positional argument runs one task and
 * exits. Both stream the assistant text through `agent/assistant-stream`.
 */
import { createInterface } from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@coridis/agent'
import '@coridis/agent'
import '@coridis/agent-loop'
import { boot, composeEntries } from './boot.ts'
import { loadDotEnv } from './env.ts'

export interface CliOptions {
  profile: string
  task: string | null
  dumpConfig: boolean
  help: boolean
}

export function parseArgs(argv: readonly string[]): CliOptions {
  let profile = 'minimal'
  let dumpConfig = false
  let help = false
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--profile' || arg === '-p') profile = argv[++i] ?? profile
    else if (arg.startsWith('--profile=')) profile = arg.slice('--profile='.length)
    else if (arg === '--dump-config') dumpConfig = true
    else if (arg === '--help' || arg === '-h') help = true
    else rest.push(arg)
  }
  return { profile, task: rest.join(' ').trim() || null, dumpConfig, help }
}

function printUsage(): void {
  output.write([
    'usage: coridis [options] [task]',
    '',
    'options:',
    '  -p, --profile <name>   profile to boot (default: minimal)',
    '  --dump-config          print the composed plugin tree and exit',
    '  -h, --help             show this help',
    '',
    'With no task, starts an interactive command-line chat.',
    '',
  ].join('\n'))
}

export async function runCli(argv: readonly string[]): Promise<number> {
  loadDotEnv()
  const options = parseArgs(argv)
  if (options.help) {
    printUsage()
    return 0
  }
  if (options.dumpConfig) {
    const entries = await composeEntries(options.profile)
    output.write(`${JSON.stringify(entries, null, 2)}\n`)
    return 0
  }

  const ctx = await boot(options.profile)
  try {
    const agent = await ctx.agents.create()
    const off = ctx.on('agent/assistant-stream', (agentId: string, delta: string) => {
      if (agentId === agent.id) output.write(delta)
    })
    try {
      if (options.task !== null) {
        await agent.submit({ content: options.task })
        await ctx.agentLoop.run(agent.id)
        output.write('\n')
        return 0
      }
      return await chat(ctx, agent)
    } finally {
      off()
    }
  } catch (error) {
    process.stderr.write(`coridis: ${(error as Error).stack ?? String(error)}\n`)
    return 1
  } finally {
    await ctx.fiber.dispose()
  }
}

const PROMPT = 'coridis> '

async function chat(ctx: Context, agent: Agent): Promise<number> {
  output.write('coridis chat — /help for commands, /exit to leave.\n\n')
  const rl = createInterface({ input, output })
  rl.on('SIGINT', () => rl.close())
  output.write(PROMPT)
  for await (const line of rl) {
    const text = line.trim()
    if (text === '/exit' || text === '/quit' || text === '/q') break
    if (text === '/help') {
      output.write('commands: /help, /exit, /quit, /q\n')
      output.write(PROMPT)
      continue
    }
    if (text !== '') {
      try {
        await agent.submit({ content: text })
        await ctx.agentLoop.run(agent.id)
        output.write('\n')
      } catch (error) {
        process.stderr.write(`\nerror: ${(error as Error).message}\n`)
      }
    }
    output.write(PROMPT)
  }
  output.write('\n')
  rl.close()
  return 0
}
