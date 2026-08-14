import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRunsStore } from '../../stores/runsStore'
import { getRunCost } from '../../shared/lib/api'
import type { CostNode, CostResponse } from '../../shared/lib/types'
import { Badge } from '../../shared/ui/Badge'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { EmptyState } from '../../shared/ui/EmptyState'
import { shortId } from '../trajectories/shortId'
import { isDemoRunId } from '../runs/demoMock'
import { PIPELINE_ORDER, NODE_LABELS } from './dagModel'
import { RUN_STATUS_TONE, runStatusLabel } from '../../shared/lib/runStatus'
import { budgetPercent, costForNode, formatUsd, hardStopLevel } from '../costs/costModel'

// Duração no formato m:ss (padrão do timer de nó do canvas).
function formatElapsed(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Linha detalhe (label dim + valor) — dl/dd para semântica.
function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-[var(--text-dim)]">{label}</dt>
      <dd className={`truncate ${mono ? 'font-mono text-[var(--text)]' : 'text-[var(--text)]'}`}>{value}</dd>
    </div>
  )
}

// Inspetor de run (T5): coluna fixa à direita do main — w-[var(--inspector-w)],
// NÃO portal (vive no fluxo, irmão do canvas), colapsável p/ só o header
// (chevrão, padrão ConsolePanel). SEM console (vive no panel bottom — T6).
// Custo: MESMA query ['run-cost', runId] do BudgetPill (TanStack dedupe).
export function RunInspector() {
  const [collapsed, setCollapsed] = useState(false)
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const run = runs.find((r) => r.id === activeRunId) ?? null

  const { data } = useQuery<CostResponse>({
    queryKey: ['run-cost', activeRunId],
    queryFn: () => getRunCost(activeRunId as string),
    // Mesma condição do BudgetPill: demo sintética/queued/paused não têm
    // registro de custo no backend (GET /cost daria 404).
    enabled: !!activeRunId && !isDemoRunId(activeRunId) && run !== null && run.status !== 'queued' && run.status !== 'paused',
    // Polling 5s enquanto roda — custo é acumulado durante a execução.
    refetchInterval: run?.status === 'running' ? 5000 : false,
  })

  const maxUsd = data?.budget.max_usd ?? 0
  const spentUsd = data?.spent_usd ?? 0
  const percent = budgetPercent(spentUsd, maxUsd)
  const level = hardStopLevel(percent)
  const nodes: CostNode[] = data?.nodes ?? []
  const maxNodeCost = Math.max(1, ...nodes.map((n) => n.spent_usd))

  const stepIdx = run?.current_node ? PIPELINE_ORDER.indexOf(run.current_node as (typeof PIPELINE_ORDER)[number]) : -1

  const meterBg =
    level === 'blocked'
      ? 'linear-gradient(to right, var(--warn-text), var(--err-text))'
      : 'linear-gradient(to right, var(--ok-text), var(--warn-text))'
  const percentCls =
    level === 'blocked' ? 'text-[var(--err-text)]' : level === 'warn' ? 'text-[var(--warn-text)]' : 'text-[var(--text-dim)]'

  return (
    <aside
      data-testid="run-inspector"
      className="flex w-[var(--inspector-w)] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-elev)]"
    >
      <header className="flex h-[var(--panel-head-h)] shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Run Inspector</h2>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-dim)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform duration-[var(--dur-fast)] ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          >
            ▾
          </span>
        </button>
      </header>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]">
          {!run ? (
            <EmptyState
              compact
              title="No active run"
              description="Select a run to inspect its details and cost."
            />
          ) : (
            <div className="space-y-5">
              <section>
                <SectionTitle className="mb-2">Run details</SectionTitle>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone={RUN_STATUS_TONE[run.status]}>{runStatusLabel(run.status)}</Badge>
                  {run.degraded && <Badge tone="warn">degraded</Badge>}
                </div>
                <dl className="space-y-1">
                  <DetailRow label="Run" value={shortId(run.id)} mono />
                  <DetailRow label="Stack" value={run.stack || '—'} />
                  <DetailRow label="Elapsed" value={formatElapsed(run.duration_seconds)} />
                  {stepIdx >= 0 && run.current_node ? (
                    <DetailRow
                      label="Step"
                      value={`${stepIdx + 1}/${PIPELINE_ORDER.length} · ${NODE_LABELS[run.current_node as (typeof PIPELINE_ORDER)[number]] ?? run.current_node}`}
                    />
                  ) : null}
                  <DetailRow label="Thread" value={run.thread_id ? shortId(run.thread_id) : '—'} mono />
                </dl>
              </section>

              <section>
                <SectionTitle className="mb-2">Budget & Cost</SectionTitle>
                {data ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-dim)]">
                        {formatUsd(spentUsd)} / {formatUsd(maxUsd)}
                      </span>
                      <span className={`font-mono ${percentCls}`}>{percent}%</span>
                    </div>
                    <div
                      className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-elev-2)]"
                      role="meter"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Budget ${percent}% used`}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-[var(--dur-base)]"
                        style={{ width: `${Math.min(100, percent)}%`, background: meterBg }}
                      />
                    </div>
                    <ul className="mt-3 space-y-1">
                      {PIPELINE_ORDER.map((node) => {
                        const spent = costForNode(nodes, node)
                        const pct = Math.round((spent / maxNodeCost) * 100)
                        return (
                          <li key={node} data-cost-row className="flex items-center gap-2 text-xs">
                            <span className="w-20 shrink-0 truncate text-[var(--text-dim)]">{NODE_LABELS[node]}</span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-elev-2)]">
                              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-12 shrink-0 text-right font-mono text-[var(--text)]">{formatUsd(spent)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-dim)]">No cost data yet.</p>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
