import { useQuery } from '@tanstack/react-query'
import { getEvalsSummary, getHealth } from '../../shared/lib/api'
import type { EvalsSummary, HealthStatus } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Card } from '../../shared/ui/Card'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'

// Health (Tier2 — HealthPanel): monitor do engine — polling de GET /health
// (raiz, sem auth) a cada 10s enquanto aberto + status do engine via
// GET /api/v1/evals/summary.status (combinação trivial, telemetria nunca 500).
// Drawer não-modal (mesmo padrão do EvalsPanel). UI strings EN (E8),
// comentários PT.

interface HealthPanelProps {
  open: boolean
  onClose: () => void
}

// Polling de health: 10s (BLUEPRINT Tier2 — health monitor).
const HEALTH_POLL_MS = 10_000

export function HealthPanel({ open, onClose }: HealthPanelProps) {
  return (
    <Drawer open={open} title="Health" onClose={onClose}>
      <HealthPanelContent enabled={open} />
    </Drawer>
  )
}

// Conteúdo inline (T3 — sub-sidebar): mesma UI do drawer, sem wrapper.
// `enabled` liga/desliga o polling (drawer fechado para; sidebar ativa roda).
export function HealthPanelContent({ enabled = true }: { enabled?: boolean }) {
  const healthQuery = useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: getHealth,
    enabled,
    refetchInterval: enabled ? HEALTH_POLL_MS : false,
  })
  // Status do engine (runs/benchmarks) — telemetria nunca derruba com 500.
  const evalsQuery = useQuery<EvalsSummary>({
    queryKey: ['evals-summary'],
    queryFn: getEvalsSummary,
    enabled,
  })

  const health = healthQuery.data
  const engineStatus = evalsQuery.data?.status

  return (
    <div className="space-y-5">
        <section>
          <SectionTitle className="mb-2">Engine</SectionTitle>
          {healthQuery.isLoading ? (
            <p className="text-sm text-[var(--text-dim)]">Checking health…</p>
          ) : healthQuery.isError ? (
            <Alert tone="err" data-testid="health-unreachable">Engine unreachable</Alert>
          ) : health ? (
            <Card>
              <p
                data-testid="health-status"
                className={`text-sm font-semibold ${
                  health.status === 'ok' ? 'text-[var(--ok-text)]' : 'text-[var(--warn-text)]'
                }`}
              >
                {health.status === 'ok' ? 'Operational' : health.status}
              </p>
              {health.version ? (
                <p data-testid="health-version" className="mt-0.5 font-mono text-xs text-[var(--text-dim)]">
                  v{health.version}
                </p>
              ) : null}
            </Card>
          ) : null}
        </section>

        <section>
          <SectionTitle className="mb-2">Engine status</SectionTitle>
          <p data-testid="health-engine-status" className="text-sm text-[var(--text-dim)]">
            {evalsQuery.isLoading
              ? 'Loading…'
              : engineStatus === 'error'
                ? 'Telemetry error'
                : engineStatus === 'empty'
                  ? 'No telemetry yet'
                  : `Telemetry ${engineStatus ?? 'n/a'}`}
          </p>
        </section>
      </div>
  )
}
