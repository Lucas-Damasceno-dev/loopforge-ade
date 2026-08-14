import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createRun } from '../../shared/lib/api'
import { Button } from '../../shared/ui/Button'
import { Select } from '../../shared/ui/Select'
import { Input } from '../../shared/ui/Input'
import { showToast } from '../../stores/toastStore'
import type { CreateRunInput, Run } from '../../shared/lib/types'

export interface NewRunFormProps {
  onCreated: (run: Run) => void
}

// Stack canônico (resolve_tech_stack / registry.py): python, java, rust, go, js.
export const STACK_OPTIONS = ['python', 'java', 'rust', 'go', 'js'] as const

// RoutingMode do backend (schemas.py): full, fast, patch, review-only, explore.
export const ROUTING_OPTIONS = ['full', 'fast', 'patch', 'review-only', 'explore'] as const

// Monograma (1ª letra) — P1-4: sem ícone SVG de stack no design system,
// emoji → letra em span estilizado. Nunca emoji colorido.
function monogram(text: string): string {
  return text.trim().charAt(0).toUpperCase() || '?'
}

export const QUICK_PROMPTS = [
  { label: 'FastAPI Auth', idea: 'REST API with FastAPI, JWT authentication, SQLite, and user registration endpoints', stack: 'python', mode: 'full' },
  { label: 'Spring Orders', idea: 'Spring Boot REST microservice for Order Management with JPA and unit tests', stack: 'java', mode: 'full' },
  { label: 'Rust CLI', idea: 'CLI tool in Rust with Clap for file analysis and system telemetry', stack: 'rust', mode: 'full' },
  { label: 'React UI', idea: 'Modern React dashboard with TypeScript, Tailwind CSS and dark mode support', stack: 'js', mode: 'full' },
  { label: 'Fast Patch', idea: 'Fix edge cases and add regression tests for core business validation logic', stack: 'python', mode: 'patch' },
] as const

// Form de nova run (B2/M-20): idea + stack + routing_mode (+ model opcional —
// RunCreate.model vence env/config por run) via POST /api/v1/runs.
// mock_llm/interactive ficam nos defaults do client (false). TanStack Query
// useMutation — loading desabilita o botão; erro inline (alert).
export function NewRunForm({ onCreated }: NewRunFormProps) {
  const [idea, setIdea] = useState('')
  const [stack, setStack] = useState<string>(STACK_OPTIONS[0])
  const [routingMode, setRoutingMode] = useState<string>(ROUTING_OPTIONS[0])
  const [model, setModel] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const ideaRef = useRef<HTMLTextAreaElement>(null)

  // Autosize (rows=1 fixo → cresce até o conteúdo; max-h corta em ~4 linhas).
  const resizeIdea = () => {
    const el = ideaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    resizeIdea()
  }, [idea])

  const mutation = useMutation({
    mutationFn: createRun,
    onSuccess: (run) => {
      setIdea('')
      onCreated(run)
      showToast('Pipeline Started', `Run #${run.id.slice(0, 8)} (${run.stack}) is running`, 'info')
    },
  })

  const submit = (e?: FormEvent) => {
    if (e) e.preventDefault()
    const text = idea.trim()
    if (!text || mutation.isPending) return
    const payload: CreateRunInput = { idea: text, stack, routing_mode: routingMode }
    // Model vazio → omitido do body (default do backend por run).
    const m = model.trim()
    if (m) payload.model = m
    mutation.mutate(payload)
  }

  const applyPreset = (preset: (typeof QUICK_PROMPTS)[number]) => {
    setIdea(preset.idea)
    setStack(preset.stack)
    setRoutingMode(preset.mode)
    setShowPresets(false)
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <form onSubmit={submit} className="flex flex-1 items-center gap-2">
        <Select aria-label="Stack" value={stack} onChange={(e) => setStack(e.target.value)}>
          {STACK_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
        <Select aria-label="Routing mode" value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}>
          {ROUTING_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
        {/* Modelo LLM opcional (RunCreate.model — vence env/config por run).
            Input compartilhado (mesmas classes do design system); vazio omite o
            campo do body para manter o default do backend. */}
        <Input
          aria-label="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model (optional)"
          title="Modelo LLM para a run — vazio usa o default (env/config)"
          className="w-36 shrink-0"
        />
        {/* Grupo input + ação (Gemini): container único com borda/ring; o botão
            Run cola na extremidade direita do campo, sem borda interna. Textarea
            cru (sem o Textarea compartilhado) porque o grupo pede fundo/borda
            únicos — classes mantêm os tokens do design system. */}
        <div className="flex flex-1 items-stretch rounded-md border border-[var(--border)] bg-[var(--bg-elev)] transition-colors duration-[var(--dur-base)] hover:border-[var(--border-hover)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
          <textarea
            id="new-run-idea"
            ref={ideaRef}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Idea for the pipeline… (Ctrl+Enter to run)"
            aria-label="Idea"
            rows={1}
            className="w-full flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none max-h-[5.75rem]"
          />
          <button
            type="button"
            onClick={() => setShowPresets((prev) => !prev)}
            title="Quick Start Templates"
            className="flex items-center gap-1.5 border-l border-[var(--border)] px-2 text-xs font-semibold text-[var(--text-dim)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)] transition-colors"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--accent)]/15 text-(--text-2xs) font-semibold text-[var(--accent-text)]">
              T
            </span>
            Templates
          </button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={mutation.isPending || !idea.trim()}
            className="rounded-l-none px-3"
          >
            {mutation.isPending ? 'Running…' : 'Run'}
          </Button>
        </div>
        {mutation.isError ? (
          <p role="alert" className="text-xs text-[var(--err-text)]">Failed to start run</p>
        ) : null}
      </form>

      {showPresets && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 ade-fade-in">
          <span className="text-(--text-2xs) font-semibold text-[var(--text-dim)]">Quick Templates:</span>
          {QUICK_PROMPTS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-0.5 text-(--text-2xs) font-medium text-[var(--text-dim)] hover:border-[var(--accent)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)] transition-all"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--accent)]/15 text-(--text-2xs) font-semibold text-[var(--accent-text)]">
                {monogram(preset.label)}
              </span>
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
