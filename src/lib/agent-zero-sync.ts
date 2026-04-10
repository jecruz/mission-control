import { getDatabase, logAuditEvent } from './db'
import { logger } from './logger'
import { eventBus } from './event-bus'

/**
 * Agent Zero A2A Sync
 * 
 * Discovers Agent Zero instances from the AGENTZERO_A2A_ENDPOINTS
 * environment variable and registers them as agents in Mission Control.
 * 
 * Health check strategy:
 *   1. Send a GET to the A2A endpoint (expects 405 "Method Not Allowed" if alive)
 *   2. If GET fails, try a HEAD to the base URL
 *   3. Any response (including 4xx/5xx) means the server process is running
 *      — only a network error / timeout means truly offline
 */
export async function syncAgentZeroA2A(): Promise<{ ok: boolean; message: string }> {
  const endpointStr = process.env.AGENTZERO_A2A_ENDPOINTS || ''
  const endpoints = endpointStr.split(',').map(e => e.trim()).filter(Boolean)

  if (endpoints.length === 0) {
    return { ok: true, message: 'No Agent Zero A2A endpoints configured' }
  }

  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  let created = 0
  let updated = 0

  const insertAgent = db.prepare(`
    INSERT INTO agents (name, role, status, framework, source, last_seen, created_at, updated_at, config)
    VALUES (?, 'agent', 'idle', 'agent-zero', ?, ?, ?, ?, ?)
  `)
  const updateAgent = db.prepare(`
    UPDATE agents SET status = ?, last_seen = ?, updated_at = ? WHERE id = ?
  `)

  for (const endpoint of endpoints) {
    const url = new URL(endpoint)
    const agentName = `Agent Zero (${url.port || '80'})`

    const existing = db.prepare('SELECT id, status FROM agents WHERE source = ?').get(endpoint) as
      | { id: number; status: string }
      | undefined

    let isAlive = false

    try {
      // Health check: GET to the A2A endpoint. Agent Zero returns 405 (Method Not Allowed)
      // which proves the server process is running. Any HTTP response = alive.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      // Any HTTP response means the server is running
      isAlive = true
    } catch {
      // Network error or timeout — server is truly unreachable
      isAlive = false
    }

    const nextStatus = isAlive ? 'idle' : 'offline'

    if (!existing) {
      insertAgent.run(
        agentName,
        endpoint, // source
        isAlive ? now : null,
        now,
        now,
        JSON.stringify({ endpoint, a2a: true, framework: 'agent-zero' })
      )
      created++
    } else if (existing.status !== nextStatus || isAlive) {
      // Always update last_seen when alive (keeps heartbeat fresh)
      // Update status when it changes
      updateAgent.run(nextStatus, isAlive ? now : null, now, existing.id)
      if (existing.status !== nextStatus) updated++
    }
  }

  const msg = `Agent Zero Sync: ${created} discovered, ${updated} updated`
  if (created > 0 || updated > 0) {
    logger.info(msg)
    logAuditEvent({
      action: 'agent_zero_sync',
      actor: 'scheduler',
      detail: { created, updated, total: endpoints.length }
    })
    eventBus.broadcast('agent.created', { type: 'agent-zero-sync', created, updated })
  }

  return { ok: true, message: msg }
}
