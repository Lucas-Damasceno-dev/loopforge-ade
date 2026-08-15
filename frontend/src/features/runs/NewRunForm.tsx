import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError, createRun } from '../../shared/lib/api'
import { Button } from '../../shared/ui/Button'
import { Select } from '../../shared/ui/Select'
import { Input } from '../../shared/ui/Input'
import { Modal } from '../../shared/ui/Modal'
import { showToast } from '../../stores/toastStore'
import { usePipelinesStore } from '../../stores/pipelinesStore'
import { useAuthStore } from '../../stores/authStore'
import type { CreateRunInput, Run } from '../../shared/lib/types'

export interface NewRunFormProps {
  onCreated: (run: Run) => void
  /** Variante estreita (sub-sidebar 260px — T8 fix wave F1): controles
   *  empilham em coluna (selects flex-wrap, model full-width) em vez da
   *  linha única da toolbar; presets já quebram linha. */
  narrow?: boolean
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
// mock_llm fica no default do client (false). `interactive` (HITL) é decisão
// do usuário via checkbox — default TRUE: é o que faz os gates HITL existirem
// (A3; antes era forçado false no client). TanStack Query useMutation —
// loading desabilita o botão; erro inline (alert).
export function NewRunForm({ onCreated, narrow = false }: NewRunFormProps) {
  const [idea, setIdea] = useState('')
  const [stack, setStack] = useState<string>(STACK_OPTIONS[0])
  const [routingMode, setRoutingMode] = useState<string>(ROUTING_OPTIONS[0])
  const [model, setModel] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [interactive, setInteractive] = useState(true)
  const [showPresets, setShowPresets] = useState(false)
  const [snapshotDraft, setSnapshotDraft] = useState<{ name: string; description: string } | null>(null)
  const ideaRef = useRef<HTMLTextAreaElement>(null)
  const pipelines = usePipelinesStore((s) => s.pipelines)
  // Pipeline selecionado (item 2): só para a nota de snapshot — o backend
  // copia pipeline.model_dump() no POST /runs; execução usa sempre o snapshot.
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId) ?? null

  // S3 T10 (decisão 10-A): pipeline opcional no New Run — fallback automático
  // quando ausente (backend roda o pipeline default). Carrega a biblioteca no
  // mount (padrão PipelinesPanel).
  useEffect(() => {
    void usePipelinesStore.getState().fetchPipelines()
  }, [])

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

  // Mensagem de erro real do backend (ex.: 422 com detail) — fallback
  // genérico quando não há ApiError. Padrão RunsWorkspace/resumeError.
  const runError =
    mutation.error instanceof ApiError && typeof mutation.error.detail === 'string'
      ? mutation.error.detail
      : mutation.error instanceof Error
        ? mutation.error.message
        : 'Failed to start run'

  const submit = (e?: FormEvent) => {
    if (e) e.preventDefault()
    const text = idea.trim()
    if (!text || mutation.isPending) return
    if (pipelineId) {
      // Preview + edição do snapshot antes de criar (S3)
      setSnapshotDraft({
        name: selectedPipeline?.name ?? '',
        description: selectedPipeline?.description ?? '',
      })
      return
    }
    doCreate(null)
  }

  const doCreate = (snapshot: { name: string; description: string } | null) => {
    const payload: CreateRunInput = { idea: idea.trim(), stack, routing_mode: routingMode, interactive }
    const m = model.trim()
    if (m) payload.model = m
    if (pipelineId) payload.pipeline_id = pipelineId
    if (snapshot && selectedPipeline) {
      payload.snapshot = {
        name: snapshot.name,
        description: snapshot.description,
        nodes: selectedPipeline.nodes,
        edges: selectedPipeline.edges,
      }
    }
    mutation.mutate(payload)
  }

  const applyPreset = (preset: (typeof QUICK_PROMPTS)[number]) => {
    setIdea(preset.idea)
    setStack(preset.stack)
    setRoutingMode(preset.mode)
    setShowPresets(false)
  }

  // RBAC (T6): criar run exige role runner+ (viewer é read-only). can() sem
  // principal (auth off/demo) retorna true — BC preservado.
  const can = useAuthStore((s) => s.can)
  if (!can('runner')) {
    return (
      <p className="px-0.5 text-xs text-[var(--text-dim)]">
        Read-only — role runner ou admin necessária para iniciar runs.
      </p>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <form onSubmit={submit} className={narrow ? 'flex flex-col gap-1.5' : 'flex flex-1 items-center gap-2'}>
        {/* Seletores + modelo: na variante wide ficam inline no form (display:
            contents preserva o layout atual); na narrow, linha própria com
            flex-wrap (2 selects por linha) + model full-width. */}
        <div className={narrow ? 'flex flex-wrap gap-1.5' : 'contents'}>
          <Select aria-label="Stack" value={stack} onChange={(e) => setStack(e.target.value)} className={narrow ? 'min-w-0 flex-1' : undefined}>
            {STACK_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
          <Select aria-label="Routing mode" value={routingMode} onChange={(e) => setRoutingMode(e.target.value)} className={narrow ? 'min-w-0 flex-1' : undefined}>
            {ROUTING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
          {/* Pipeline opcional (S3 T10): vazio = fallback automático (pipeline
              default do backend). Backend ignora routing_mode quando pipeline
              setado — ambos enviados (decisão: manter habilitado). */}
          <Select
            aria-label="Pipeline (optional)"
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className={narrow ? 'w-full' : undefined}
          >
            <option value="">Pipeline (default)</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
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
            className={narrow ? 'w-full' : 'w-36 shrink-0'}
          />
          {/* Modo interativo (HITL): default ON — com interactive=true a run
              pausa em gates para decisão humana (drawer HITL). Desligar roda
              a pipeline sem paradas. */}
          <label
            className={narrow ? 'flex items-center gap-1.5 px-0.5' : 'flex shrink-0 items-center gap-1.5 px-0.5'}
            title="Modo interativo (HITL): a run pausa em pontos críticos para decisão humana"
          >
            <input
              type="checkbox"
              checked={interactive}
              onChange={(e) => setInteractive(e.target.checked)}
              aria-label="Modo interativo (HITL)"
              className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[var(--border)] accent-[var(--accent)]"
            />
            <span className="cursor-pointer text-(--text-2xs) font-semibold uppercase tracking-wide text-[var(--text-dim)]">
              HITL
            </span>
          </label>
        </div>
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
          <p role="alert" className="text-xs text-[var(--err-text)]">{runError}</p>
        ) : null}
      </form>

      {/* Snapshot do pipeline (S3): Run abre preview editável antes de criar —
          o pipeline é copiado (pipeline.model_dump()) no momento da criação da
          run; edições posteriores NÃO afetam runs já criadas. */}
      {pipelineId !== '' && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)]/50 px-2.5 py-1.5 ade-fade-in">
          <p className="text-(--text-2xs) font-semibold uppercase tracking-wide text-[var(--text-dim)]">Snapshot ao criar</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-dim)]">
            Run abre um preview do pipeline antes de criar — a versão executada é
            copiada no momento da criação; edições posteriores não afetam runs já criadas.
          </p>
        </div>
      )}

      {snapshotDraft && (
        <Modal open title="Snapshot do pipeline" maxWidth={480} onClose={() => setSnapshotDraft(null)}>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-lg font-semibold text-[var(--text)]">Snapshot do pipeline</h2>
            <p className="text-sm text-[var(--text-dim)]">
              Este snapshot é copiado no momento da criação — a run executa SEMPRE esta
              versão, mesmo que o template mude depois.
            </p>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)]/50 px-2.5 py-1.5">
              <p className="text-(--text-2xs) font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                {snapshotDraft.name} · {selectedPipeline?.nodes.length ?? 0} nós · {selectedPipeline?.edges.length ?? 0} arestas
              </p>
            </div>
            <label className="flex flex-col gap-0.5">
              <span className="text-(--text-2xs) font-medium uppercase tracking-wide text-[var(--text-dim)]">
                Descrição do snapshot
              </span>
              <Input
                aria-label="Descrição do snapshot"
                value={snapshotDraft.description}
                onChange={(e) => setSnapshotDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                className="w-full"
              />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSnapshotDraft(null)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={() => { doCreate(snapshotDraft); setSnapshotDraft(null) }}>
                Criar run
              </Button>
            </div>
          </div>
        </Modal>
      )}

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
