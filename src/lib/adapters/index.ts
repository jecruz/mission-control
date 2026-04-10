import { ClaudeSdkAdapter } from './claude-sdk'
import { AgentZeroAdapter } from './agent-zero'
import type { FrameworkAdapter } from './adapter'

const adapters: Record<string, () => FrameworkAdapter> = {
  openclaw: () => new OpenClawAdapter(),
  generic: () => new GenericAdapter(),
  crewai: () => new CrewAIAdapter(),
  langgraph: () => new LangGraphAdapter(),
  autogen: () => new AutoGenAdapter(),
  'claude-sdk': () => new ClaudeSdkAdapter(),
  'agent-zero': () => new AgentZeroAdapter(),
}

export function getAdapter(framework: string): FrameworkAdapter {
  const factory = adapters[framework]
  if (!factory) throw new Error(`Unknown framework adapter: ${framework}`)
  return factory()
}

export function listAdapters(): string[] {
  return Object.keys(adapters)
}

export type { FrameworkAdapter, AgentRegistration, HeartbeatPayload, TaskReport, Assignment } from './adapter'
