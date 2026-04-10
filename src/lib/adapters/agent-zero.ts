import { eventBus } from '@/lib/event-bus'
import { queryPendingAssignments } from './adapter'
import type { FrameworkAdapter, AgentRegistration, HeartbeatPayload, TaskReport, Assignment } from './adapter'

/**
 * AgentZeroAdapter
 * 
 * Implements the Agent-to-Agent (A2A) protocol for interacting with Agent Zero.
 * This adapter uses JSON-RPC 2.0 over the provided A2A endpoints.
 */
export class AgentZeroAdapter implements FrameworkAdapter {
  readonly framework = 'agent-zero'

  private async callA2A(endpoint: string, method: string, params: any = {}) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      })

      if (!response.ok) {
        throw new Error(`A2A request failed with status ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error(`[AgentZero] A2A call failed (${method}):`, error)
      throw error
    }
  }

  async register(agent: AgentRegistration): Promise<void> {
    // In A2A, we broadcast that this agent exists and is online.
    eventBus.broadcast('agent.created', {
      id: agent.agentId,
      name: agent.name,
      framework: this.framework,
      status: 'online',
      ...(agent.metadata ?? {}),
    })

    // If we have an endpoint in metadata, we could try to notify the agent
    const endpoint = (agent.metadata?.endpoint ?? '') as string
    if (endpoint) {
      try {
        await this.callA2A(endpoint, 'agents/register', {
          name: 'Mission Control',
          capabilities: ['orchestrator', 'monitor'],
        })
      } catch (err) {
        // Fallback: the agent might not require explicit registration
      }
    }
  }

  async heartbeat(payload: HeartbeatPayload): Promise<void> {
    eventBus.broadcast('agent.status_changed', {
      id: payload.agentId,
      status: payload.status,
      metrics: payload.metrics ?? {},
      framework: this.framework,
    })
  }

  async reportTask(report: TaskReport): Promise<void> {
    eventBus.broadcast('task.updated', {
      id: report.taskId,
      agentId: report.agentId,
      progress: report.progress,
      status: report.status,
      output: report.output,
      framework: this.framework,
    })
  }

  async getAssignments(agentId: string): Promise<Assignment[]> {
    return queryPendingAssignments(agentId)
  }

  async disconnect(agentId: string): Promise<void> {
    eventBus.broadcast('agent.status_changed', {
      id: agentId,
      status: 'offline',
      framework: this.framework,
    })
  }
}
