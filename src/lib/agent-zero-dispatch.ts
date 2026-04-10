/**
 * Agent Zero Dispatch
 *
 * Sends tasks to Agent Zero instances via their native REST API.
 *
 * Agent Zero does NOT use JSON-RPC for task dispatch (its A2A endpoint
 * only works for agent card discovery). Instead, it uses a CSRF-protected
 * REST API:
 *
 *   1. POST /api/csrf_token  → get session + CSRF token
 *   2. POST /api/message_async  → send a task message
 *   3. POST /api/poll?context=<id>  → poll for result
 *
 * The session cookie must be forwarded between requests.
 */

import { logger } from './logger'

interface AgentZeroSession {
  csrfToken: string
  cookies: string[]
  baseUrl: string
}

/**
 * Establish a session with an Agent Zero instance.
 * Returns CSRF token + session cookies needed for subsequent API calls.
 */
async function createSession(baseUrl: string): Promise<AgentZeroSession> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${baseUrl}/api/csrf_token`, {
      method: 'POST',
      headers: {
        'Origin': baseUrl,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      throw new Error(`CSRF token request failed: ${res.status} ${await res.text()}`)
    }

    const data = await res.json() as { ok: boolean; token: string; runtime_id?: string }
    if (!data.ok || !data.token) {
      throw new Error(`CSRF token response invalid: ${JSON.stringify(data)}`)
    }

    // Extract Set-Cookie headers for session persistence
    const cookies: string[] = []
    const setCookieHeaders = res.headers.getSetCookie?.() ?? []
    for (const header of setCookieHeaders) {
      // Keep only the cookie name=value part (strip Path, HttpOnly, etc.)
      const nameValue = header.split(';')[0]
      if (nameValue) cookies.push(nameValue)
    }

    // Fallback: some Node.js versions don't have getSetCookie()
    if (cookies.length === 0) {
      const rawSetCookie = res.headers.get('set-cookie')
      if (rawSetCookie) {
        cookies.push(rawSetCookie.split(';')[0])
      }
    }

    return {
      csrfToken: data.token,
      cookies,
      baseUrl,
    }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

export interface AgentZeroDispatchResult {
  contextId: string
  message: string
}

/**
 * Send a task to an Agent Zero instance.
 * Returns the context ID which can be used to poll for results.
 */
export async function sendTaskToAgentZero(
  endpoint: string,
  taskText: string,
): Promise<AgentZeroDispatchResult> {
  // Extract base URL from A2A endpoint (strip /a2a/... path)
  const url = new URL(endpoint)
  const baseUrl = `${url.protocol}//${url.host}`

  logger.info({ baseUrl }, 'Establishing Agent Zero session')
  const session = await createSession(baseUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000) // 2 minute timeout for task dispatch

  try {
    const res = await fetch(`${baseUrl}/api/message_async`, {
      method: 'POST',
      headers: {
        'Origin': baseUrl,
        'Content-Type': 'application/json',
        'X-Csrf-Token': session.csrfToken,
        'Cookie': session.cookies.join('; '),
      },
      body: JSON.stringify({ text: taskText }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Agent Zero message_async failed: ${res.status} ${body}`)
    }

    const data = await res.json() as { message: string; context: string }

    logger.info(
      { baseUrl, contextId: data.context },
      'Task dispatched to Agent Zero'
    )

    return {
      contextId: data.context,
      message: data.message || 'Message received',
    }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

export interface AgentZeroPollResult {
  running: boolean
  contextName: string | null
  logs: any[]
  response: string | null
}

/**
 * Poll an Agent Zero instance for the status and result of a dispatched task.
 */
export async function pollAgentZeroTask(
  endpoint: string,
  contextId: string,
): Promise<AgentZeroPollResult> {
  const url = new URL(endpoint)
  const baseUrl = `${url.protocol}//${url.host}`

  const session = await createSession(baseUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${baseUrl}/api/poll?context=${encodeURIComponent(contextId)}`, {
      method: 'POST',
      headers: {
        'Origin': baseUrl,
        'Content-Type': 'application/json',
        'X-Csrf-Token': session.csrfToken,
        'Cookie': session.cookies.join('; '),
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      throw new Error(`Agent Zero poll failed: ${res.status}`)
    }

    const data = await res.json() as {
      contexts?: Array<{
        id: string
        name: string
        running: boolean
        log_length: number
      }>
      logs?: any[]
    }

    // Find our context
    const ctx = data.contexts?.find(c => c.id === contextId)

    // Extract text from logs (agent responses are in log entries of type 'response')
    let responseText: string | null = null
    if (data.logs && data.logs.length > 0) {
      const responseLogs = data.logs
        .filter((l: any) => l.type === 'response' || l.type === 'message')
        .map((l: any) => l.content || l.text || '')
        .filter(Boolean)
      if (responseLogs.length > 0) {
        responseText = responseLogs.join('\n')
      }
    }

    return {
      running: ctx?.running ?? false,
      contextName: ctx?.name ?? null,
      logs: data.logs ?? [],
      response: responseText,
    }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}
