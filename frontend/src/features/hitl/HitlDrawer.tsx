import { useEffect, useMemo, useState } from 'react'
import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatus } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { useConsoleStore } from '../../stores/consoleStore'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Banner } from '../../shared/ui/Banner'
import { Textarea } from '../../shared/ui/Textarea'
import { Toggle } from '../../shared/ui/Toggle'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { decideRun, getDecisions } from '../../shared/lib/api'
import type { DecisionRecord } from '../../shared/lib/types'
import { NODE_LABELS, PIPELINE_ORDER } from '../dag/dagModel'

// Ações reais do backend (HumanDecisionCreate.action): approve, retry,
// adjust_prompt, abort — task_dispatcher mapeia p/ "c"/"r"/"a"/"x".
type Action = 'approve' | 'retry' | 'abort' | 'adjust_prompt'

// Drawer HITL (UX8/UX9/UX10): abre automaticamente quando a run ativa tem um
// nó paused no canvas (não-modal — o nó segue visível). Ações chamam a API
// real decideRun; Abort passa por confirmação destrutiva (§3.13); erro inline
// (role=alert); timeout (UX10) detectado pelo warn 'HITL decision expired'
// que o wsBridge (T5) já loga; histórico auditável via getDecisions. Sem run
// ativa ou sem nó paused → não renderiza nada.
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
  const [jsonState, setJsonState] = useState('{}')
  const [decisions, setDecisions] = useState<DecisionRecord[]>([])
  const [decisionsLoading, setDecisionsLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  // Gate = primeiro nó paused na ordem do pipeline.
  const gateNode = useMemo(() => PIPELINE_ORDER.find((n) => nodeStatus[n]?.status === 'paused') ?? null, [nodeStatus])
  const run = runs.find((r) => r.id === activeRunId) ?? null

  // Reabre o drawer quando o gate muda (nova pausa).
  useEffect(() => {
    setDismissed(false)
  }, [gateNode])

  // Timeout (UX10): human_decision_expired → o wsBridge loga warn com os
  // segundos na mensagem ('HITL decision expired (300s)') — segundos parseados.
  const expiredEntry = useMemo(() => entries.find((e) => e.level === 'warn' && /expired/i.test(e.message)), [entries])
  const timeoutSeconds = expiredEntry ? /(\d+)s/.exec(expiredEntry.message)?.[1] : undefined

  // Histórico de decisões (trilha auditável — dados reais do backend).
  useEffect(() => {
    if (!run) return
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
        action === 'approve' || action === 'adjust_prompt' ? 'approved' : action === 'abort' ? 'rejected' : 'pending'
      setNodeStatus(gateNode, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed')
    } finally {
      setPendingAction(null)
    }
  }

  const submitAdjust = async () => {
    // Valida o JSON antes de enviar. GAP V1 documentado: HumanDecisionCreate
    // não tem campo `state` (Pydantic v2 ignora extras) — o JSON vai no
    // feedback_message e o backend NÃO aplica o estado editado no pipeline.
    try {
      JSON.parse(jsonState)
    } catch {
      setError('Invalid JSON')
      return
    }
    await runAction('adjust_prompt', { feedback_category: 'state_adjust', feedback_message: jsonState })
  }

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
          <div
            role="alert"
            className="mb-4 rounded-md border border-[var(--err)]/30 bg-[var(--err)]/15 px-3 py-2 text-sm text-[var(--err-text)]"
          >
            {error}
          </div>
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
            {showAdvanced && (
              <p className="mb-2 text-xs text-[var(--text-dim)]">
                Expected: JSON object of state fields, e.g. {'{ "memory": { "flag": true } }'}.
              </p>
            )}
            <Textarea
              aria-label="State JSON"
              value={jsonState}
              onChange={(e) => setJsonState(e.target.value)}
              className="h-28 font-mono text-xs"
            />
            {/* GAP V1: o wire real (HumanDecisionCreate) não aplica estado — só feedback. */}
            <p className="mt-2 text-xs text-[var(--warn)]">
              V1 gap: state edits are not applied yet — JSON is sent as feedback_message.
            </p>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="primary" disabled={pendingAction !== null} onClick={submitAdjust}>
                Apply
              </Button>
            </div>
          </div>
        )}

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Decision history</h3>
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
