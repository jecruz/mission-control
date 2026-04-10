import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const providers = db.prepare('SELECT * FROM ai_providers ORDER BY name ASC').all()
    
    // Mask API keys for display
    const masked = providers.map((p: any) => ({
      ...p,
      api_key: p.api_key ? '**********' : null
    }))
    
    return NextResponse.json({ providers: masked })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { name, base_url, api_key, default_model } = body

    if (!name || !base_url) {
      return NextResponse.json({ error: 'Name and Base URL are required' }, { status: 400 })
    }

    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO ai_providers (name, base_url, api_key, default_model)
      VALUES (?, ?, ?, ?)
    `).run(name, base_url, api_key || null, default_model || null)

    return NextResponse.json({ id: result.lastInsertRowid, success: true })
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'A provider with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
