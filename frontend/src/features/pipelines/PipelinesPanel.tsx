import { useEffect, useState, type FormEvent } from 'react'
import { usePipelinesStore } from '../../stores/pipelinesStore'
import { useEditorStore } from './editorStore'
import { useAuthStore } from '../../stores/authStore'
import type { Pipeline, PipelineInput } from '../../shared/lib/types'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Alert } from '../../shared/ui/Alert'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionTitle } from '../../shared/ui/SectionTitle'

// Monograma (1ª letra) — padrão do repo (NewRunForm/AgentsPanel): sem emoji.
function monogram(text: string): string {
  return text.trim().charAt(0).toUpperCase() || '?'
}

interface FormState {
  name: string
  description: string
}

const EMPTY_FORM: FormState = { name: '', description: '' }

// PipelinesPanel (S3): biblioteca de pipelines na sub-sidebar (narrow 260px).
// Lista com monograma + counts (N nodes / M edges) + desc truncada; clique
// seleciona p/ edição de metadados (o grafo em si é editado no canvas — wire
// p/ editorStore.open na T9). Form name*/description + delete com confirm
// inline (estado); 422 inline EN via store (padrão AgentsPanel/SettingsPanel);
// aria-live via Alert err (role=alert).
export function PipelinesPanel() {
  const pipelines = usePipelinesStore((s) => s.pipelines)
  // Fetch inicial em andamento (store.loading) → indicador em vez do
  // EmptyState prematuro ("No pipelines yet" flash durante o GET).
  const pipelinesLoading = usePipelinesStore((s) => s.loading)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Pipeline | null>(null)
  // Wire T9 (editorStore.open): nesta task o clique só marca a seleção
  // localmente e mostra o hint "Edit in canvas" — T9 move p/ o editor.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void usePipelinesStore.getState().fetchPipelines()
  }, [])

  // RBAC (T6): CRUD de pipelines é admin-only. Viewer vê a biblioteca
  // (read-only); can() sem principal (auth off/demo) retorna true — BC.
  const can = useAuthStore((s) => s.can)
  const canAdmin = can('admin')

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const startNew = () => {
    setEditing(null)
    setSelectedId('new')
    setForm(EMPTY_FORM)
    setError(null)
    setConfirmDelete(false)
    setView('form')
  }

  const startEdit = (p: Pipeline) => {
    setEditing(p)
    setSelectedId(p.id)
    setForm({ name: p.name, description: p.description })
    setError(null)
    setConfirmDelete(false)
    setView('form')
  }

  const cancel = () => {
    setView('list')
    setEditing(null)
    setError(null)
    setConfirmDelete(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // RBAC (fix round 1): defesa em profundidade — Save está oculto p/ não-admin
    // e startNew/startEdit são gateados, mas submit via Enter no input Name/
    // Description burlaria a UI; o backend já 403a (fim da linha).
    if (!canAdmin) return
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setError(null)
    setSaving(true)
    // Grafo (nodes/edges) editado no canvas (T9) — create/update de
    // metadados carrega o grafo atual do pipeline (create: vazio).
    const input: PipelineInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      nodes: editing?.nodes ?? [],
      edges: editing?.edges ?? [],
    }
    try {
      if (editing) await usePipelinesStore.getState().updatePipeline(editing.id, input)
      else await usePipelinesStore.getState().createPipeline(input)
      cancel()
    } catch {
      setError(usePipelinesStore.getState().error ?? 'Failed to save pipeline')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    setError(null)
    setSaving(true)
    try {
      await usePipelinesStore.getState().deletePipeline(editing.id)
      cancel()
    } catch {
      setError(usePipelinesStore.getState().error ?? 'Failed to delete pipeline')
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert tone="err">{error}</Alert>
      ) : null}

      {view === 'list' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Library</SectionTitle>
            {canAdmin && (
              <Button size="sm" variant="primary" onClick={startNew}>
                + New pipeline
              </Button>
            )}
          </div>
          {pipelinesLoading ? (
            <p className="px-2 py-6 text-sm text-[var(--text-dim)]">Loading…</p>
          ) : pipelines.length === 0 ? (
            <EmptyState
              compact
              title="No pipelines yet"
              description="Create reusable pipeline templates for the workspace."
              action={
                canAdmin ? (
                  <Button size="sm" variant="primary" onClick={startNew}>
                    Create pipeline
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {pipelines.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (canAdmin) startEdit(p)
                    }}
                    aria-pressed={selectedId === p.id}
                    className={[
                      'flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-left transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                    ].join(' ')}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent)]/15 text-xs font-semibold text-[var(--accent-text)]">
                      {monogram(p.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[var(--text)]">{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-sm border border-[var(--border)]/40 bg-[var(--bg-elev)] px-1 py-px text-[var(--text-2xs)] text-[var(--text-dim)]">
                          {p.nodes.length} nodes
                        </span>
                        <span className="rounded-sm border border-[var(--border)]/40 bg-[var(--bg-elev)] px-1 py-px text-[var(--text-2xs)] text-[var(--text-dim)]">
                          {p.edges.length} edges
                        </span>
                      </span>
                      {p.description ? (
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-dim)]">{p.description}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
          {canAdmin && selectedId && selectedId !== 'new' ? (
            <button
              type="button"
              onClick={() => {
                if (editing) useEditorStore.getState().openPipeline(editing.id, editing)
              }}
              disabled={!editing}
              className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-elev)] p-2 text-left text-xs text-[var(--text-dim)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Edit in canvas — the pipeline graph opens in the canvas editor.
            </button>
          ) : null}
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Name *</span>
            <Input value={form.name} aria-label="Name" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Description</span>
            <Input value={form.description} aria-label="Description" onChange={(e) => set({ description: e.target.value })} />
          </label>

          {canAdmin && editing && !confirmDelete ? (
            <div className="mt-1 border-t border-[var(--border)] pt-1.5">
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Delete pipeline
              </Button>
            </div>
          ) : null}
          {canAdmin && editing && confirmDelete ? (
            <div className="mt-1 flex flex-col gap-1 rounded-md border border-[var(--err)]/30 bg-[var(--err)]/15 p-2">
              <span className="text-xs text-[var(--err-text)]">Delete {editing.name}?</span>
              <span className="flex gap-1.5">
                <Button size="sm" variant="danger" onClick={handleDelete} disabled={saving}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  Cancel
                </Button>
              </span>
            </div>
          ) : null}

          <div className="mt-1 flex gap-1.5 border-t border-[var(--border)] pt-1.5">
            {canAdmin && (
              <Button size="sm" variant="primary" type="submit" disabled={saving}>
                Save
              </Button>
            )}
            <Button size="sm" variant="ghost" type="button" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
