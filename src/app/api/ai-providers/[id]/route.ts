import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { name, base_url, api_key, default_model } = body

    const db = getDatabase()
    
    // Support partial updates (especially for api_key)
    if (api_key && api_key !== '**********') {
      db.prepare(`
        UPDATE ai_providers 
        SET name = ?, base_url = ?, api_key = ?, default_model = ?
        WHERE id = ?
      `).run(name, base_url, api_key, default_model || null, id)
    } else {
      db.prepare(`
        UPDATE ai_providers 
        SET name = ?, base_url = ?, default_model = ?
        WHERE id = ?
      `).run(name, base_url, default_model || null, id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'A provider with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
