'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface AIProvider {
  id: number
  name: string
  base_url: string
  api_key: string | null
  default_model: string | null
}

export function AiProvidersList() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  // Edit/Create State
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [formData, setFormData] = useState<Partial<AIProvider>>({})
  const [saving, setSaving] = useState(false)

  const showFeedback = (ok: boolean, text: string) => {
    setFeedback({ ok, text })
    setTimeout(() => setFeedback(null), 3000)
  }

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/ai-providers')
      if (!res.ok) throw new Error('Failed to load DB providers')
      const data = await res.json()
      setProviders(data.providers || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProviders()
  }, [])

  const handleEdit = (p: AIProvider) => {
    setEditingId(p.id)
    setFormData(p)
  }

  const handleCreate = () => {
    setEditingId('new')
    setFormData({ base_url: 'http://', default_model: '' })
  }

  const handleCancel = () => {
    setEditingId(null)
    setFormData({})
  }

  const handleSave = async () => {
    if (!formData.name || !formData.base_url) {
      showFeedback(false, 'Name and Base URL are required')
      return
    }

    setSaving(true)
    try {
      const isNew = editingId === 'new'
      const url = isNew ? '/api/ai-providers' : `/api/ai-providers/${editingId}`
      const method = isNew ? 'POST' : 'PUT'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback(true, isNew ? 'Provider created' : 'Provider updated')
        setEditingId(null)
        setFormData({})
        fetchProviders()
      } else {
        showFeedback(false, data.error || 'Failed to save provider')
      }
    } catch {
      showFeedback(false, 'Network error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this provider?')) return

    try {
      const res = await fetch(`/api/ai-providers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showFeedback(true, 'Provider removed')
        fetchProviders()
      } else {
        const data = await res.json()
        showFeedback(false, data.error || 'Failed to remove provider')
      }
    } catch {
      showFeedback(false, 'Network error')
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading DB providers...</div>
  if (error) return <div className="text-sm text-destructive">{error}</div>

  return (
    <div className="space-y-4 pt-6 mt-6 border-t border-border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Custom AI Providers (Database)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure dynamic OpenAI-compatible endpoints directly. 
            No .env restarts required. Use these by setting {'{"providerName": "NAME"}'} in an agent&apos;s config.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={editingId !== null} size="sm" variant="outline">
          Add Provider
        </Button>
      </div>

      {feedback && (
        <div className={`rounded-lg p-3 text-xs font-medium ${feedback.ok ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {feedback.text}
        </div>
      )}

      {editingId === 'new' && (
        <ProviderEditor 
          data={formData} 
          onChange={d => setFormData(d)} 
          onSave={handleSave} 
          onCancel={handleCancel} 
          saving={saving} 
        />
      )}

      <div className="space-y-3">
        {providers.map(p => (
          <div key={p.id}>
            {editingId === p.id ? (
              <ProviderEditor 
                data={formData} 
                onChange={d => setFormData(d)} 
                onSave={handleSave} 
                onCancel={handleCancel} 
                saving={saving} 
              />
            ) : (
              <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {p.name}
                    {p.default_model && <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded">{p.default_model}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">{p.base_url}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(p.id)}>Delete</Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {providers.length === 0 && editingId !== 'new' && (
          <div className="text-sm text-center py-6 text-muted-foreground border border-dashed rounded-lg">
            No custom providers yet.
          </div>
        )}
      </div>
    </div>
  )
}

function ProviderEditor({ 
  data, 
  onChange, 
  onSave, 
  onCancel, 
  saving 
}: { 
  data: Partial<AIProvider>
  onChange: (d: Partial<AIProvider>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="bg-secondary/30 border border-primary/30 rounded-lg p-4 space-y-4">
      <div className="text-sm font-medium">Configure Provider</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground block">Provider Name (Unique ID)</span>
          <input 
            className="w-full bg-background border rounded px-2 py-1 text-sm font-mono" 
            value={data.name || ''} 
            onChange={e => onChange({ ...data, name: e.target.value })} 
            placeholder="e.g. lmstudio"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground block">Base URL</span>
          <input 
            className="w-full bg-background border rounded px-2 py-1 text-sm font-mono" 
            value={data.base_url || ''} 
            onChange={e => onChange({ ...data, base_url: e.target.value })} 
            placeholder="http://127.0.0.1:1234/v1"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground block">API Key (Optional)</span>
          <input 
            type="password"
            className="w-full bg-background border rounded px-2 py-1 text-sm font-mono" 
            value={data.api_key || ''} 
            onChange={e => onChange({ ...data, api_key: e.target.value })} 
            placeholder={data.api_key === '**********' ? '**********' : 'sk-...'}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground block">Default Model (Optional)</span>
          <input 
            className="w-full bg-background border rounded px-2 py-1 text-sm font-mono" 
            value={data.default_model || ''} 
            onChange={e => onChange({ ...data, default_model: e.target.value })} 
            placeholder="e.g. llama-3-8b"
          />
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Provider'}</Button>
      </div>
    </div>
  )
}
