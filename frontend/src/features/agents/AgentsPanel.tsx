import { useEffect, useState, type FormEvent } from 'react'
import { useAgentsStore } from '../../stores/agentsStore'
import type { Agent, AgentInput } from '../../shared/lib/types'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { Textarea } from '../../shared/ui/Textarea'
import { Alert } from '../../shared/ui/Alert'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { formatUsd } from '../costs/costModel'

// Stack canônico do backend (resolve_tech_stack / registry.py) — mesmas
// opções do NewRunForm; fonte local p/ não acoplar features/runs ↔ agents.
export const AGENT_STACK_OPTIONS = ['python', 'java', 'rust', 'go', 'js'] as const

// Monograma (1ª letra) — padrão do repo (NewRunForm): sem emoji, span estilizado.
function monogram(text: string): string {
  return text.trim().charAt(0).toUpperCase() || '?'
}

// env_vars "KEY=value" por linha → Record; linha sem '=' vira chave vazia.
function envFromText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const eq = line.indexOf('=')
    if (eq === -1) out[line] = ''
    else out[line.slice(0, eq).trim()] = line.slice(eq + 1)
  }
  return out
}
function textFromEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

// tools/permissions: comma-separated ↔ string[].
function listFromText(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function textFromList(list: string[]): string {
  return list.join(', ')
}

// C8: campo numérico opcional — string vazia/NaN → undefined (campo OMITIDO
// do payload; backend aplica default e valida ge/le). Clamp aplicado pelo
// consumidor (timeout ge=1, temperature le=2 — ver handleSubmit).
function optionalNumber(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

interface FormState {
  name: string
  description: string
  prompt: string
  model: string
  stack: string
  temperature: string
  max_retries: string
  timeout_seconds: string
  budget_usd: string
  env_vars: string
  tools_allowlist: string
  permissions: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  prompt: '',
  model: '',
  stack: AGENT_STACK_OPTIONS[0],
  temperature: '0.2',
  max_retries: '1',
  timeout_seconds: '60',
  budget_usd: '',
  env_vars: '',
  tools_allowlist: '',
  permissions: '',
}

function formFromAgent(a: Agent): FormState {
  return {
    name: a.name,
    description: a.description,
    prompt: a.prompt,
    model: a.model,
    stack: a.stack,
    temperature: String(a.temperature),
    max_retries: String(a.max_retries),
    timeout_seconds: String(a.timeout_seconds),
    budget_usd: String(a.budget_usd),
    env_vars: textFromEnv(a.env_vars),
    tools_allowlist: textFromList(a.tools_allowlist),
    permissions: textFromList(a.permissions),
  }
}

// AgentsPanel (S2): biblioteca + CRUD na sub-sidebar (narrow 260px).
// Lista com monograma + chips (stack/model) + budget; clique edita; "+ New
// agent" cria. Form em coluna (2/linha p/ campos curtos), textarea autosize,
// validação local (name/prompt), erro 422 inline EN (padrão SettingsPanel —
// store já seta mensagem amigável + detail no console), delete com confirm
// inline (estado, não window.confirm).
export function AgentsPanel() {
  const agents = useAgentsStore((s) => s.agents)
  // Fetch inicial em andamento (store.loading) → indicador em vez do
  // EmptyState prematuro ("No agents yet" flash durante o GET).
  const agentsLoading = useAgentsStore((s) => s.loading)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Agent | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void useAgentsStore.getState().fetchAgents()
  }, [])

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  // Autosize do prompt (Textarea do design system não expõe ref — id local).
  const resizePrompt = () => {
    const el = document.getElementById('agent-prompt') as HTMLTextAreaElement | null
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(resizePrompt, [form.prompt])

  const startNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setConfirmDelete(false)
    setView('form')
  }

  const startEdit = (a: Agent) => {
    setEditing(a)
    setForm(formFromAgent(a))
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
    if (!form.name.trim() || !form.prompt.trim()) {
      setError('Name and prompt are required.')
      return
    }
    setError(null)
    setSaving(true)
    const input: Partial<AgentInput> = {
      name: form.name.trim(),
      description: form.description.trim(),
      prompt: form.prompt.trim(),
      model: form.model.trim(),
      stack: form.stack,
      max_retries: Number(form.max_retries) || 0,
      budget_usd: Number(form.budget_usd) || 0,
      env_vars: envFromText(form.env_vars),
      tools_allowlist: listFromText(form.tools_allowlist),
      permissions: listFromText(form.permissions),
    }
    // C8: timeout_seconds/temperature são opcionais — campo limpo NÃO vira 0
    // (backend rejeita timeout 0 com ge=1; temperatura fora de [0,2] também).
    // Vazio → omite (default do backend); com valor → clamp nos limites.
    const temperature = optionalNumber(form.temperature)
    if (temperature !== undefined) input.temperature = Math.min(2, Math.max(0, temperature))
    const timeoutSeconds = optionalNumber(form.timeout_seconds)
    if (timeoutSeconds !== undefined) input.timeout_seconds = Math.max(1, timeoutSeconds)
    try {
      if (editing) await useAgentsStore.getState().updateAgent(editing.id, input)
      else await useAgentsStore.getState().createAgent(input)
      cancel()
    } catch {
      // Mensagem amigável já setada no store (422 pydantic → genérica + detail
      // no console); fallback defensivo.
      setError(useAgentsStore.getState().error ?? 'Failed to save agent')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    setError(null)
    setSaving(true)
    try {
      await useAgentsStore.getState().deleteAgent(editing.id)
      cancel()
    } catch {
      setError(useAgentsStore.getState().error ?? 'Failed to delete agent')
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  const fieldCls = 'flex flex-wrap items-center gap-1.5'
  const numInput = (label: string, value: string, onChange: (v: string) => void, min = 0, step = 'any', max?: number) => (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert tone="err">{error}</Alert>
      ) : null}

      {view === 'list' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Library</SectionTitle>
            <Button size="sm" variant="primary" onClick={startNew}>
              + New agent
            </Button>
          </div>
          {agentsLoading ? (
            <p className="px-2 py-6 text-sm text-[var(--text-dim)]">Loading…</p>
          ) : agents.length === 0 ? (
            <EmptyState
              compact
              title="No agents yet"
              description="Create reusable agents for the workspace."
              action={
                <Button size="sm" variant="primary" onClick={startNew}>
                  Create agent
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {agents.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className={[
                      'flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-left transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                    ].join(' ')}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent)]/15 text-xs font-semibold text-[var(--accent-text)]">
                      {monogram(a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[var(--text)]">{a.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-sm border border-[var(--border)]/40 bg-[var(--bg-elev)] px-1 py-px text-[var(--text-2xs)] text-[var(--text-dim)]">{a.stack}</span>
                        <span className="rounded-sm border border-[var(--border)]/40 bg-[var(--bg-elev)] px-1 py-px text-[var(--text-2xs)] text-[var(--text-dim)]">{a.model}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[var(--text-2xs)] text-[var(--text-dim)]">{formatUsd(a.budget_usd)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Name *</span>
            <Input value={form.name} aria-label="Name" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Description</span>
            <Input value={form.description} aria-label="Description" onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Prompt *</span>
            <Textarea
              id="agent-prompt"
              rows={3}
              value={form.prompt}
              aria-label="Prompt"
              onChange={(e) => set({ prompt: e.target.value })}
            />
          </label>

          <div className={fieldCls}>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Model</span>
              <Input value={form.model} aria-label="Model" onChange={(e) => set({ model: e.target.value })} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Stack</span>
              <Select value={form.stack} aria-label="Stack" onChange={(e) => set({ stack: e.target.value })}>
                {AGENT_STACK_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className={fieldCls}>
            {numInput('Temperature', form.temperature, (v) => set({ temperature: v }), 0, 'any', 2)}
            {numInput('Max retries', form.max_retries, (v) => set({ max_retries: v }), 0, '1')}
          </div>
          <div className={fieldCls}>
            {numInput('Timeout (s)', form.timeout_seconds, (v) => set({ timeout_seconds: v }), 1, '1')}
            {numInput('Budget (USD)', form.budget_usd, (v) => set({ budget_usd: v }), 0)}
          </div>

          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Env vars (KEY=value per line)</span>
            <Textarea
              rows={2}
              value={form.env_vars}
              aria-label="Env vars (KEY=value per line)"
              onChange={(e) => set({ env_vars: e.target.value })}
              className="font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Tools allowlist (comma-separated)</span>
            <Input value={form.tools_allowlist} aria-label="Tools allowlist (comma-separated)" onChange={(e) => set({ tools_allowlist: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[var(--text-2xs)] font-medium uppercase tracking-wide text-[var(--text-dim)]">Permissions (comma-separated)</span>
            <Input value={form.permissions} aria-label="Permissions (comma-separated)" onChange={(e) => set({ permissions: e.target.value })} />
          </label>

          {editing && !confirmDelete ? (
            <div className="mt-1 border-t border-[var(--border)] pt-1.5">
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Delete agent
              </Button>
            </div>
          ) : null}
          {editing && confirmDelete ? (
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
            <Button size="sm" variant="primary" type="submit" disabled={saving}>
              Save
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
