import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deletePrompt, listPrompts, savePrompt } from '../../shared/lib/prompts'
import type { PromptEntry } from '../../shared/lib/prompts'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { Textarea } from '../../shared/ui/Textarea'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'

// Prompt Central (PromptPanel): lista o prompt EFETIVO de cada nó da esteira
// (override persistido ou default embutido), permite editar/salvar override
// (PATCH /api/v1/prompts/{node}) e resetar para o default (DELETE). Nós
// editados localmente entram no set `overridden` para habilitar o Reset.

interface ApiLikeError {
  status: number
  detail: unknown
}
function isApiError(e: unknown): e is ApiLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    'detail' in e
  )
}
function promptsErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    const detail = e.detail
    if (Array.isArray(detail)) return 'Invalid prompt data (422)'
    if (typeof detail === 'string' && detail.trim().length > 0) return detail
    return `API error ${e.status}`
  }
  return e instanceof Error && e.message ? e.message : 'Failed to load prompts'
}

// Rótulo amigável por nó (exibição) — nós sem prompt de persona (qa/devops)
// não aparecem na API.
const NODE_LABELS: Record<string, string> = {
  cpo: 'CPO',
  pm: 'Product Manager',
  tech_lead: 'Tech Lead',
  test_writer: 'Test Writer',
  developer: 'Developer',
  appsec: 'AppSec',
}

function truncate(text: string, max = 140): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

export function PromptPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} title="Prompts" onClose={onClose}>
      <PromptPanelContent />
    </Drawer>
  )
}

// Conteúdo inline (T3 — sub-sidebar): mesma UI do drawer, sem wrapper.
export function PromptPanelContent() {
  const queryClient = useQueryClient()

  // Editor ativo: nó em edição + rascunho do prompt.
  const [editingNode, setEditingNode] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Nós com override salvo na sessão (habilita Reset; API não expõe flag).
  const [overridden, setOverridden] = useState<Set<string>>(new Set())

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['prompts'] })

  const { data: entries, isLoading, error: loadError } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => listPrompts(),
  })

  const startEdit = (entry: PromptEntry) => {
    setEditingNode(entry.node)
    setDraft(entry.prompt)
    setError(null)
    setSaved(false)
  }

  const submitSave = async () => {
    if (!editingNode || !draft.trim()) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await savePrompt(editingNode, draft.trim())
      setOverridden((prev) => new Set(prev).add(editingNode))
      setSaved(true)
      invalidate()
    } catch (e) {
      setError(promptsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const submitReset = async (node: string) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await deletePrompt(node)
      setOverridden((prev) => {
        const next = new Set(prev)
        next.delete(node)
        return next
      })
      if (editingNode === node) {
        setEditingNode(null)
        setDraft('')
      }
      setSaved(true)
      invalidate()
    } catch (e) {
      setError(promptsErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
        {error && (
          <Alert tone="err">{error}</Alert>
        )}
        {saved && (
          <Alert tone="ok">Prompt saved</Alert>
        )}

        <section>
          <SectionTitle className="mb-1">Node prompts</SectionTitle>
          <p className="mb-2 text-xs text-[var(--text-dim)]">
            Overrides are applied to the next run of each node. Reset restores the built-in default.
          </p>
          {isLoading ? (
            <p className="text-sm text-[var(--text-dim)]">Loading prompts…</p>
          ) : loadError ? (
            <Alert tone="err">{promptsErrorMessage(loadError)}</Alert>
          ) : entries && entries.length > 0 ? (
            <ul className="space-y-1.5">
              {entries.map((entry) => (
                <li key={entry.node} className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone="accent">{NODE_LABELS[entry.node] ?? entry.node}</Badge>
                        {overridden.has(entry.node) && <Badge tone="warn">custom</Badge>}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-dim)]" title={entry.prompt}>
                        {truncate(entry.prompt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="subtle"
                        aria-label={`Edit ${entry.node} prompt`}
                        disabled={busy}
                        onClick={() => startEdit(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Reset ${entry.node} prompt`}
                        disabled={busy || !overridden.has(entry.node)}
                        onClick={() => submitReset(entry.node)}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>

                  {editingNode === entry.node && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        aria-label={`${entry.node} prompt text`}
                        className="h-40 font-mono text-xs"
                        value={draft}
                        disabled={busy}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setEditingNode(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy || !draft.trim()}
                          onClick={submitSave}
                        >
                          {busy ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-dim)]">No prompts available</p>
          )}
        </section>
      </div>
  )
}
