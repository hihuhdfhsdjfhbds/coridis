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
import { boot } from './boot.ts'

export interface CliOptions {
  profile: string
  task: string | null
}

export function parseArgs(argv: readonly string[]): CliOptions {
  let profile = 'minimal'
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--profile' || arg === '-p') profile = argv[++i] ?? profile
    else if (arg.startsWith('--profile=')) profile = arg.slice('--profile='.length)
    else rest.push(arg)
  }
  return { profile, task: rest.join(' ').trim() || null }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const { profile, task } = parseArgs(argv)
  const ctx = await boot(profile)
  try {
    const agent = await ctx.agents.create()
    const off = ctx.on('agent/assistant-stream', (agentId: string, delta: string) => {
      if (agentId === agent.id) output.write(delta)
    })
    try {
      if (task !== null) {
        await agent.submit({ content: task })
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

async function chat(ctx: Context, agent: Agent): Promise<number> {
  output.write('coridis chat — /help for commands, /exit to leave.\n\n')
  const rl = createInterface({ input, output, prompt: 'coridis> ' })
  rl.on('SIGINT', () => rl.close())
  rl.prompt()
  for await (const line of rl) {
    const text = line.trim()
    if (text === '') {
      rl.prompt()
      continue
    }
    if (text === '/exit' || text === '/quit' || text === '/q') break
    if (text === '/help') {
      output.write('commands: /help, /exit, /quit, /q\n')
      rl.prompt()
      continue
    }
    try {
      await agent.submit({ content: text })
      await ctx.agentLoop.run(agent.id)
      output.write('\n')
    } catch (error) {
      process.stderr.write(`\nerror: ${(error as Error).message}\n`)
    }
    rl.prompt()
  }
  rl.close()
  return 0
}
