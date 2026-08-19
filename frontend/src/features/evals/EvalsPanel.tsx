import { useQuery } from '@tanstack/react-query'
import { getEvalsLeaderboard, getEvalsSummary } from '../../shared/lib/api'
import type { EvalsLeaderboard, EvalsSummary } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Card } from '../../shared/ui/Card'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'
import { EmptyState } from '../../shared/ui/EmptyState'
import { formatUsd } from '../costs/costModel'

// Evals (pilar 5 do BLUEPRINT — EvalsPanel): telemetria de benchmarks/ELO da
// engine (GET /api/v1/evals/summary + /leaderboard). Summary cards (pass rate,
// duração média, custo total, total de runs) + leaderboard de run_*.json
// quando houver. Drawer não-modal (mesmo padrão do SettingsPanel), sem lib de
// chart — barras/divs estilizadas com tokens do design system (tokens.css).
// UI strings EN (E8), comentários PT.

interface EvalsPanelProps {
  open: boolean
  onClose: () => void
}

// Taxa 0.0–1.0 → percentual inteiro p/ exibição (pass_rate/avg_pass_rate).
function formatRate(rate: number | undefined): string {
  return `${Math.round((rate ?? 0) * 100)}%`
}

// Duração compacta (ex.: 45.0s) — o backend arredonda para 2 casas.
function formatDuration(seconds: number | undefined): string {
  return `${(seconds ?? 0).toFixed(1)}s`
}

// Card de métrica do summary (grid 2x2, vocabulário do design system).
function MetricCard({
  testId,
  label,
  value,
  tone = 'text-[var(--text)]',
}: {
  testId: string
  label: string
  value: string
  tone?: string
}) {
  return (
    <Card data-testid={testId}>
      <span className="block text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</span>
      <span className={`text-lg font-semibold ${tone}`}>{value}</span>
    </Card>
  )
}

export function EvalsPanel({ open, onClose }: EvalsPanelProps) {
  // Queries só disparam com o drawer aberto (evita fetch desnecessário).
  const summaryQuery = useQuery<EvalsSummary>({
    queryKey: ['evals-summary'],
    queryFn: getEvalsSummary,
    enabled: open,
  })
  const leaderboardQuery = useQuery<EvalsLeaderboard>({
    queryKey: ['evals-leaderboard'],
    queryFn: getEvalsLeaderboard,
    enabled: open,
  })

  const summary = summaryQuery.data
  const leaderboard = leaderboardQuery.data

  return (
    <Drawer open={open} title="Evals" onClose={onClose}>
      {summaryQuery.isLoading ? (
        <p className="text-sm text-[var(--text-dim)]">Loading evals…</p>
      ) : summaryQuery.isError ? (
        <Alert tone="err">Failed to load evals telemetry</Alert>
      ) : summary ? (
        summary.status === 'error' ? (
          <Alert tone="err">{summary.message ?? 'Evals telemetry is currently unavailable'}</Alert>
        ) : summary.status === 'empty' ? (
          <EmptyState
            title="No evals yet"
            description="Benchmark telemetry will appear here once the engine finishes an eval run."
          />
        ) : (
        <div className="space-y-5">
          <section>
            <SectionTitle className="mb-2">Summary</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                testId="evals-pass-rate"
                label="Pass rate"
                value={formatRate(summary.pass_rate)}
                tone="text-[var(--ok-text)]"
              />
              <MetricCard testId="evals-avg-duration" label="Avg duration" value={formatDuration(summary.avg_duration_seconds)} />
              <MetricCard testId="evals-total-cost" label="Total cost" value={formatUsd(summary.total_cost_usd)} />
              <MetricCard testId="evals-total-runs" label="Total runs" value={String(summary.total_runs)} />
            </div>
          </section>

          <section>
            <SectionTitle className="mb-2">Benchmarks</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard testId="evals-benchmark-runs" label="Benchmark runs" value={String(summary.benchmark_runs)} />
              <MetricCard
                testId="evals-bench-pass-rate"
                label="Bench pass rate"
                value={formatRate(summary.avg_pass_rate)}
                tone="text-[var(--ok-text)]"
              />
              <MetricCard testId="evals-elo" label="ELO" value={summary.current_elo.toFixed(1)} tone="text-[var(--info-text)]" />
            </div>
          </section>

          <section>
            <SectionTitle className="mb-2">Leaderboard</SectionTitle>
            {leaderboardQuery.isLoading ? (
              <p className="text-sm text-[var(--text-dim)]">Loading leaderboard…</p>
            ) : leaderboardQuery.isError ? (
              <Alert tone="err">Failed to load leaderboard</Alert>
            ) : !leaderboard ? null : leaderboard.status === 'error' ? (
              <Alert tone="err">{leaderboard.message ?? 'Failed to load leaderboard data'}</Alert>
            ) : leaderboard.status === 'empty' || leaderboard.entries.length === 0 ? (
              <p data-testid="evals-leaderboard-empty" className="text-sm text-[var(--text-dim)]">
                No benchmark runs yet
              </p>
            ) : (
              <ul className="space-y-1.5">
                {leaderboard.entries.map((e) => (
                  <li
                    key={e.run_id}
                    data-testid={`evals-entry-${e.run_id}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-[var(--text)]">{e.run_id}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{e.stack}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          e.success
                            ? 'bg-[var(--ok)]/15 text-[var(--ok-text)]'
                            : 'bg-[var(--err)]/15 text-[var(--err-text)]'
                        }`}
                      >
                        {e.success ? 'Pass' : 'Fail'}
                      </span>
                      <span className="text-[var(--text-dim)]">{formatDuration(e.duration_seconds)}</span>
                      <span className="text-[var(--text-dim)]">{formatUsd(e.estimated_cost_usd)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        )
      ) : null}
    </Drawer>
  )
}
