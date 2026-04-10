import { getDatabase, logAuditEvent } from './db'
import { logger } from './logger'
import { eventBus } from './event-bus'

/**
 * Agent Zero A2A Sync
 * 
 * Discovers Agent Zero instances from the AGENTZERO_A2A_ENDPOINTS
 * environment variable and registers them as agents in Mission Control.
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

  const findBySource = db.prepare('SELECT id, name, config FROM agents WHERE framework = ? AND source = ?')
  const insertAgent = db.prepare(`
    INSERT INTO agents (name, role, status, framework, source, created_at, updated_at, config)
    VALUES (?, 'agent', 'online', 'agent-zero', ?, ?, ?, ?)
  `)
  const updateStatus = db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?')

  for (const endpoint of endpoints) {
    // Generate a unique ID for this endpoint
    const url = new URL(endpoint)
    const agentId = `agent-zero-${url.port || '80'}-${url.pathname.split('/').pop()}`
    const agentName = `Agent Zero (${url.port || '80'})`

    const existing = db.prepare('SELECT id, status FROM agents WHERE source = ?').get(endpoint) as any

    try {
      // Try to ping the agent (using a dummy JSON-RPC call or just checking connectivity)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'agents/get', params: {} }),
        signal: controller.signal
      })
      clearTimeout(timeout)

      const isOnline = response.ok || response.status === 405 // 405 is fine (method not allowed but server is up)

      if (!existing) {
        insertAgent.run(
          agentName,
          endpoint, // source
          now,
          now,
          JSON.stringify({ endpoint, a2a: true, framework: 'agent-zero' })
        )
        created++
      } else {
        const nextStatus = isOnline ? 'online' : 'offline'
        if (existing.status !== nextStatus) {
          updateStatus.run(nextStatus, now, existing.id)
          updated++
        }
      }
    } catch (err) {
      if (existing && existing.status !== 'offline') {
        updateStatus.run('offline', now, existing.id)
        updated++
      }
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
