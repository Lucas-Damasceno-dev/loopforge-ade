import { useEffect, useMemo, useState } from 'react'
import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatus } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { useConsoleStore } from '../../stores/consoleStore'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Banner } from '../../shared/ui/Banner'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { Toggle } from '../../shared/ui/Toggle'
import { Select } from '../../shared/ui/Select'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { decideRun, getDecisions, getCheckpoints, getCheckpoint } from '../../shared/lib/api'
import type { DecisionRecord } from '../../shared/lib/types'
import { isDemoRunId } from '../runs/demoMock'
import { NODE_LABELS, PIPELINE_ORDER } from '../dag/dagModel'

// Ações reais do backend (HumanDecisionCreate.action): approve, retry,
// adjust_prompt, adjust_state, abort — task_dispatcher mapeia p/ "c"/"r"/"a"/"as"/"x".
type Action = 'approve' | 'retry' | 'abort' | 'adjust_prompt' | 'adjust_state'

// Campos do form guiado (C3/M-12): canais REAIS do GraphState
// (src/lf/pipeline/state.py — idea, stack, routing_mode, next_agent, code).
// O backend descarta canais fora do TypedDict — "requirements" NÃO é canal.
const GUIDED_FIELDS: Array<{ key: string; label: string; kind: 'text' | 'select' | 'textarea'; options?: string[] }> = [
  { key: 'idea', label: 'Idea', kind: 'text' },
  { key: 'stack', label: 'Stack', kind: 'text' },
  { key: 'routing_mode', label: 'Routing mode', kind: 'select', options: ['full', 'fast', 'patch', 'review-only', 'explore'] },
  { key: 'next_agent', label: 'Next agent', kind: 'text' },
  { key: 'code', label: 'Code', kind: 'textarea' },
]

// Valor curto para o diff (antes → depois); undefined = desconhecido.
function fmt(v: unknown): string {
  if (typeof v === 'string') return v.length === 0 ? '""' : v
  return JSON.stringify(v) ?? '—'
}

// Drawer HITL (UX8/UX9/UX10): abre automaticamente quando a run ativa tem um
// nó paused no canvas (não-modal — o nó segue visível). Ações chamam a API
// real decideRun; Abort passa por confirmação destrutiva (§3.13); erro inline
// (role=alert); timeout (UX10) detectado pelo warn 'HITL decision expired'
// que o wsBridge (T5) já loga; histórico auditável via getDecisions. Sem run
// ativa ou sem nó paused → não renderiza nada.
//
// C3 (M-12): "Adjust State" agora usa action=adjust_state com state_patch
// (aplicado ao checkpoint pelo backend) — form guiado com os canais do
// GraphState + modo JSON avançado (validação com erro EN) + diff leve
// antes→depois dos campos editados (best-effort: valores atuais vêm do último
// checkpoint da thread quando disponível; senão, só o resumo dos campos).
export function HitlDrawer() {
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  const setNodeStatus = useCanvasStore((s) => s.setNodeStatus)
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const entries = useConsoleStore((s) => s.entries)

  const [pendingAction, setPendingAction] = useState<Action | null>(null)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [patch, setPatch] = useState<Record<string, unknown>>({})
  const [jsonText, setJsonText] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [beforeValues, setBeforeValues] = useState<Record<string, unknown> | null>(null)
  const [decisions, setDecisions] = useState<DecisionRecord[]>([])
  const [decisionsLoading, setDecisionsLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  // Gate = primeiro nó paused na ordem do pipeline.
  const gateNode = useMemo(() => PIPELINE_ORDER.find((n) => nodeStatus[n]?.status === 'paused') ?? null, [nodeStatus])
  const run = runs.find((r) => r.id === activeRunId) ?? null

  // Reabre o drawer quando o gate muda (nova pausa) e zera o form de ajuste.
  useEffect(() => {
    setDismissed(false)
    setShowAdjust(false)
    setPatch({})
    setJsonText('{}')
    setJsonError(null)
    setBeforeValues(null)
  }, [gateNode])

  // Valores atuais dos campos (diff antes→depois): último checkpoint da
  // thread quando o backend serve checkpoint_id (V1 best-effort — sem ele,
  // o diff vira só o resumo dos campos editados).
  useEffect(() => {
    if (!showAdjust || !run?.thread_id) return
    const threadId = run.thread_id
    let cancelled = false
    getCheckpoints(threadId)
      .then(async (cps) => {
        if (cancelled || cps.length === 0) return
        const last = cps[cps.length - 1] as { checkpoint_id?: string }
        if (typeof last.checkpoint_id !== 'string') return // V1: [{thread_id}] sem id
        const cp = await getCheckpoint(threadId, last.checkpoint_id)
        if (cancelled) return
        const channel = (cp.state?.channel_values ?? {}) as Record<string, unknown>
        setBeforeValues(channel)
      })
      .catch(() => { /* best-effort — sem checkpoint/backend, segue o resumo */ })
    return () => { cancelled = true }
  }, [showAdjust, run?.thread_id])

  // Timeout (UX10): human_decision_expired → o wsBridge loga warn com os
  // segundos na mensagem ('HITL decision expired (300s)') — segundos parseados.
  const expiredEntry = useMemo(() => entries.find((e) => e.level === 'warn' && /expired/i.test(e.message)), [entries])
  const timeoutSeconds = expiredEntry ? /(\d+)s/.exec(expiredEntry.message)?.[1] : undefined

  // Histórico de decisões (trilha auditável — dados reais do backend). Runs
  // demo-* são sintéticas (sem registro no backend) — GET /decisions daria
  // 404; sem fetch, o histórico fica vazio (sem dados para mostrar).
  useEffect(() => {
    if (!run?.id || isDemoRunId(run.id)) return
    let cancelled = false
    setDecisionsLoading(true)
    getDecisions(run.id)
      .then((ds) => {
        if (!cancelled) setDecisions(ds)
      })
      .catch(() => {
        if (!cancelled) setDecisions([])
      })
      .finally(() => {
        if (!cancelled) setDecisionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [run?.id])

  // Regra: sem run ativa ou sem nó paused → não renderiza.
  if (run === null || gateNode === null || dismissed) return null

  const label = NODE_LABELS[gateNode]

  const runAction = async (action: Action, body?: Record<string, unknown>) => {
    setPendingAction(action)
    setError(null)
    try {
      await decideRun(run.id, { action, gate_node: gateNode, ...body })
      // Sucesso: o gate sai do paused — o drawer fecha automaticamente.
      const next: NodeStatus =
        action === 'approve' || action === 'adjust_prompt' || action === 'adjust_state'
          ? 'approved'
          : action === 'abort'
            ? 'rejected'
            : 'pending'
      setNodeStatus(gateNode, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed')
    } finally {
      setPendingAction(null)
    }
  }

  // Escreve um campo guiado no patch (fonte única de verdade) e sincroniza o
  // texto JSON avançado. Valor vazio remove o canal (patch menor).
  const updatePatch = (key: string, value: string) => {
    setPatch((prev) => {
      const next = { ...prev }
      if (value === '') delete next[key]
      else next[key] = value
      setJsonText(JSON.stringify(next, null, 2))
      return next
    })
  }

  // Edição livre do JSON avançado: parse em tempo real, erro EN se inválido.
  const onJsonChange = (text: string) => {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('State must be a valid JSON object (dict)')
        return
      }
      setPatch(parsed as Record<string, unknown>)
      setJsonError(null)
    } catch {
      setJsonError('Invalid JSON — check the syntax before applying')
    }
  }

  const submitAdjustState = async () => {
    if (jsonError) return // erro inline já visível abaixo do JSON
    if (Object.keys(patch).length === 0) {
      setError('No fields changed — edit at least one state field')
      return
    }
    await runAction('adjust_state', { state_patch: patch })
  }

  const editedKeys = Object.keys(patch)

  return (
    <>
      {expiredEntry && (
        <Banner tone="warn">Decision expired ({timeoutSeconds ?? '?'}s) — run paused</Banner>
      )}
      <Drawer
        open={true}
        title="Human in the loop"
        onClose={() => setDismissed(true)}
        titleStyle={{ color: 'var(--accent-text)' }}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--accent-text)' }}>{label}</span>
          <Badge tone="warn">Waiting for decision</Badge>
        </div>

        {error && (
          <Alert tone="err" className="mb-4">{error}</Alert>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button variant="primary" size="sm" disabled={pendingAction !== null} onClick={() => runAction('approve')}>
            Approve
          </Button>
          <Button variant="ghost" size="sm" disabled={pendingAction !== null} onClick={() => runAction('retry')}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" disabled={pendingAction !== null} onClick={() => setConfirmAbort(true)}>
            Abort
          </Button>
          <Button variant="subtle" size="sm" disabled={pendingAction !== null} onClick={() => setShowAdjust((v) => !v)}>
            Adjust State
          </Button>
        </div>

        {showAdjust && (
          <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Adjust state</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-xs text-[var(--text-dim)]">Advanced JSON</span>
                <Toggle checked={showAdvanced} onChange={setShowAdvanced} label="Advanced JSON" />
              </span>
            </div>
            <p className="mb-3 text-xs text-[var(--text-dim)]">
              Edit pipeline state fields — the run continues after applying (action{' '}
              <span className="font-mono">adjust_state</span> + <span className="font-mono">state_patch</span>).
            </p>

            {/* Form guiado: canais reais do GraphState. */}
            <div className="space-y-2.5">
              {GUIDED_FIELDS.map((f) => {
                const value = typeof patch[f.key] === 'string' ? (patch[f.key] as string) : ''
                const common = { 'aria-label': f.label }
                return (
                  <div key={f.key}>
                    <label htmlFor={`hitl-${f.key}`} className="mb-0.5 block text-(--text-2xs) text-[var(--text-dim)]">{f.label}</label>
                    {f.kind === 'select' ? (
                      <Select
                        id={`hitl-${f.key}`}
                        {...common}
                        value={value}
                        onChange={(e) => updatePatch(f.key, e.target.value)}
                        className="w-full"
                      >
                        <option value="">—</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </Select>
                    ) : f.kind === 'textarea' ? (
                      <Textarea id={`hitl-${f.key}`} {...common} value={value} onChange={(e) => updatePatch(f.key, e.target.value)} className="h-20 font-mono text-xs" />
                    ) : (
                      <Input id={`hitl-${f.key}`} {...common} value={value} onChange={(e) => updatePatch(f.key, e.target.value)} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* JSON avançado: visão completa do patch, editável. */}
            {showAdvanced && (
              <div className="mt-3">
                <Textarea
                  aria-label="State JSON"
                  value={jsonText}
                  invalid={jsonError !== null}
                  onChange={(e) => onJsonChange(e.target.value)}
                  className="h-28 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-[var(--text-dim)]">
                  Full patch sent as <span className="font-mono">state_patch</span>. Channels outside the GraphState
                  are discarded by the backend.
                </p>
                {jsonError && (
                  <p role="alert" className="mt-1 text-xs text-[var(--err-text)]">{jsonError}</p>
                )}
              </div>
            )}

            {/* Diff leve: antes → depois dos campos editados (best-effort). */}
            {editedKeys.length > 0 && (
              <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  Changed fields ({editedKeys.length})
                </p>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                  {editedKeys.map((k) => (
                    <li key={k} className="flex items-baseline gap-1 text-[var(--text-dim)]">
                      <span className="shrink-0 text-[var(--accent-text)]">{k}</span>
                      <span className="shrink-0">:</span>
                      <span className="min-w-0 flex-1 truncate">{beforeValues ? fmt(beforeValues[k]) : '—'}</span>
                      <span aria-hidden="true" className="shrink-0 text-[var(--warn)]">→</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--text)]">{fmt(patch[k])}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="primary" disabled={pendingAction !== null} onClick={submitAdjustState}>
                Apply
              </Button>
            </div>
          </div>
        )}

        <section>
          <SectionTitle className="mb-1">Decision history</SectionTitle>
          {decisionsLoading ? (
            <p className="text-sm text-[var(--text-dim)]">Loading decisions…</p>
          ) : decisions.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No decisions yet</p>
          ) : (
            <ul className="space-y-0.5 font-mono text-xs leading-5">
              {decisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded px-1 text-[var(--text-dim)] transition-colors duration-100 hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)]"
                >
                  <span className="font-medium text-[var(--text)]">{d.user}</span> · {d.timestamp ?? ''} · {d.action} on{' '}
                  {d.gate_node}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Drawer>

      {/* Confirmação destrutiva (01b §3.13) — Abort nunca dispara direto. */}
      <ConfirmDialog
        open={confirmAbort}
        title="Abort run?"
        message="This stops the run and rejects pending decisions. You can retry it later."
        confirmLabel="Abort"
        onConfirm={() => {
          setConfirmAbort(false)
          runAction('abort')
        }}
        onCancel={() => setConfirmAbort(false)}
      />
    </>
  )
}
