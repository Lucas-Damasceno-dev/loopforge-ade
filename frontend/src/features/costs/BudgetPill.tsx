import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRunCost, overrideRunBudget } from '../../shared/lib/api'
import type { CostResponse } from '../../shared/lib/types'
import { useRunsStore } from '../../stores/runsStore'
import { isDemoRunId } from '../runs/demoMock'
import { Banner } from '../../shared/ui/Banner'
import { Button } from '../../shared/ui/Button'
import { Modal } from '../../shared/ui/Modal'
import { Input } from '../../shared/ui/Input'
import { budgetPercent, formatUsd, hardStopLevel, parseMaxUsd } from './costModel'
import { useBudgetOverrideStore } from './budgetOverrideStore'

// Pill flutuante de orçamento (T4): substitui o CostBar na topbar — agora
// vive no canto inferior esquerdo do canvas (absolute bottom-3 left-3 z-20),
// deixando a topbar limpa p/ o trigger central da command palette (Task 7).
//
// Reusa a MESMA query do CostBar ['run-cost', runId] (TanStack deduplica —
// FlowCanvas consome a mesma key p/ o custo por nó) e o costModel. Estados
// sem dados de custo (run ausente/queued/paused/erro/demo sintética) mostram
// um dot discreto, como o CostBar fazia.
export function BudgetPill({ runId, onOverride }: { runId?: string | null; onOverride: () => void }) {
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const effectiveRunId = runId ?? activeRunId
  const run = runs.find((r) => r.id === effectiveRunId) ?? null

  const { data, isError, isLoading } = useQuery<CostResponse>({
    queryKey: ['run-cost', effectiveRunId],
    queryFn: () => getRunCost(effectiveRunId as string),
    // Run demo-* é sintética (sem registro no backend) — GET /cost daria 404.
    enabled: !!effectiveRunId && !isDemoRunId(effectiveRunId) && run !== null && run.status !== 'queued' && run.status !== 'paused',
    // Polling 5s enquanto roda (mesmo padrão do InspectDrawer): custo é
    // acumulado pelo backend durante a execução — sem isso o pill fica stale.
    refetchInterval: run?.status === 'running' ? 5000 : false,
  })

  const maxUsd = data?.budget.max_usd ?? 0
  const spentUsd = data?.spent_usd ?? 0
  const percent = budgetPercent(spentUsd, maxUsd)
  const level = hardStopLevel(percent)

  const [toast, setToast] = useState(false)
  const [overrideDismissed, setOverrideDismissed] = useState(false) // bloqueio vencido (escaped)
  const [overrideValue, setOverrideValue] = useState('')
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const queryClient = useQueryClient()
  const overrideOpen = useBudgetOverrideStore((s) => s.open)
  const closeOverride = useBudgetOverrideStore((s) => s.closeOverride)

  // Toast temporário (3s) quando entra no nível warn (comportamento herdado
  // do CostBar).
  useEffect(() => {
    if (level !== 'warn') return
    setToast(true)
    const t = setTimeout(() => setToast(false), 3000)
    return () => clearTimeout(t)
  }, [level])

  // Sem dados de custo (run ausente/queued/paused/demo sintética/erro) →
  // dot discreto (mesmo vocabulário do CostBar: dot + label, não-interativo).
  const noData =
    effectiveRunId === null || run === null || isDemoRunId(effectiveRunId) || run.status === 'queued' || run.status === 'paused' || isError
  if (noData) {
    return (
      <div
        data-testid="budget-empty"
        className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 shadow-[var(--shadow-xs)]"
        title="Budget — no cost data yet"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--bg-elev-2)]" />
        <span className="text-(--text-2xs) uppercase tracking-wide text-[var(--text-dim)]">Budget</span>
      </div>
    )
  }

  // Mini-meter 4 segmentos (T4): cada um = 25% do budget; ativos conforme o
  // percentual (arredondado), cor pelo nível (ok → accent, warn, blocked).
  const activeSegs = Math.max(0, Math.min(4, Math.round(percent / 25)))
  const segColor =
    level === 'blocked' ? 'bg-[var(--err)]' : level === 'warn' ? 'bg-[var(--warn)]' : 'bg-[var(--accent)]'

  // Usado > total → rótulo em --err-text (01b §3.4).
  const overBudget = maxUsd > 0 && spentUsd > maxUsd
  const labelCls = overBudget ? 'text-[var(--err-text)]' : 'text-[var(--text-dim)]'

  const submitOverride = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseMaxUsd(overrideValue)
    if ('error' in parsed) {
      setOverrideError(parsed.error)
      return
    }
    if (effectiveRunId === null) return
    setSubmitting(true)
    setOverrideError(null)
    try {
      await overrideRunBudget(effectiveRunId, { max_usd: parsed.value })
      closeOverride()
      setOverrideValue('')
      queryClient.invalidateQueries({ queryKey: ['run-cost', effectiveRunId] })
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Override failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {toast && level === 'warn' && <Banner tone="warn">Budget at {percent}% — approaching the limit</Banner>}
      <button
        type="button"
        onClick={onOverride}
        title={maxUsd > 0 ? `Budget ${percent}% — ${formatUsd(spentUsd)} of ${formatUsd(maxUsd)}` : 'Budget — no limit set'}
        className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 shadow-[var(--shadow-xs)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {isLoading && maxUsd === 0 ? (
          <span data-testid="budget-label" aria-hidden="true" className="block h-3 w-14 animate-pulse rounded bg-[var(--bg-elev-2)]" />
        ) : (
          <span data-testid="budget-label" className={`text-xs ${labelCls}`}>
            Budget {data?.estimated ? '~' : ''}
            {formatUsd(spentUsd)} · {formatUsd(maxUsd)}
          </span>
        )}
        <span role="img" aria-label={`Budget ${percent}% used`} className="flex items-center gap-0.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              data-meter={i < activeSegs ? 'on' : 'off'}
              aria-hidden="true"
              className={`h-1 w-2 rounded-sm ${i < activeSegs ? segColor : 'bg-[var(--bg-elev-2)]'}`}
            />
          ))}
        </span>
      </button>

      {/* Modal de enforcement — bloqueante, NÃO fecha por Esc/overlay: o
          usuário precisa decidir (override) conscientemente. */}
      {level === 'blocked' && !overrideDismissed && !overrideOpen && (
        <Modal open title="Budget limit reached" maxWidth={400}>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-[var(--text)]">Budget limit reached</h2>
            <p className="mt-1 text-sm text-[var(--text-dim)]">
              Spent ${spentUsd} of ${maxUsd} ({percent}%). New runs are blocked.
            </p>
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setOverrideDismissed(true)
                  useBudgetOverrideStore.getState().openOverride(effectiveRunId as string)
                }}
              >
                Give override
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de override (M-10): POST /runs/{id}/cost/override {max_usd}. */}
      <Modal open={overrideOpen} title="Budget override" onClose={closeOverride} maxWidth={400}>
        <div className="p-4">
          <h2 className="text-lg font-semibold text-[var(--text)]">Budget override</h2>
          <p className="mt-1 text-sm text-[var(--text-dim)]">
            Set a new budget limit (USD) for run <code className="font-mono">{effectiveRunId}</code>.
          </p>
          <form onSubmit={submitOverride} className="mt-4">
            <Input
              aria-label="Max USD"
              type="text"
              inputMode="decimal"
              value={overrideValue}
              onChange={(e) => {
                setOverrideValue(e.target.value)
                setOverrideError(null)
              }}
              placeholder="e.g. 20"
              invalid={overrideError !== null}
              className="w-full"
            />
            {overrideError ? (
              <p role="alert" className="mt-1 text-xs text-[var(--err-text)]">
                {overrideError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={closeOverride}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" type="submit" disabled={submitting || !overrideValue.trim()}>
                {submitting ? 'Saving…' : 'Apply'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  )
}
