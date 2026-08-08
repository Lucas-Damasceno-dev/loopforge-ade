import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRunCost, overrideRunBudget } from '../../shared/lib/api'
import type { CostResponse } from '../../shared/lib/types'
import { useRunsStore } from '../../stores/runsStore'
import { Banner } from '../../shared/ui/Banner'
import { Button } from '../../shared/ui/Button'
import { Modal } from '../../shared/ui/Modal'
import { Input } from '../../shared/ui/Input'
import { budgetPercent, hardStopLevel, parseMaxUsd } from './costModel'

// Barra de orçamento da run ATIVA (UX12, M-08/M-10): dados REAIS de
// GET /api/v1/runs/{id}/cost (total_cost_usd + budget efetivo). Estados sem
// dados de custo (run ausente, queued, paused ou erro → ex.: run demo local)
// mostram um empty state COMPACTO (vocabulário do design system — a topbar
// h-11 não comporta o EmptyState centralizado com py-12).
//
// Cores (01b §3.4): <80% --info (estado informativo — preserva §1.2);
// 80–99% --warn; ≥100% --err. Marcador de 80% (linha 1px). Override (M-10):
// visível quando percent >= 80 — abre modal para POST cost/override.
export function CostBar({
  runId,
  maxUsd: maxUsdProp,
  spentUsd: spentUsdProp,
  className = '',
}: {
  runId?: string
  maxUsd?: number
  spentUsd?: number
  className?: string
}) {
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const effectiveRunId = runId ?? activeRunId
  const run = runs.find((r) => r.id === effectiveRunId) ?? null

  // Modo controlado (testes/demo): props diretas — sem fetch.
  const controlled = maxUsdProp !== undefined || spentUsdProp !== undefined

  const { data, isError, isLoading } = useQuery<CostResponse>({
    queryKey: ['run-cost', effectiveRunId],
    queryFn: () => getRunCost(effectiveRunId as string),
    enabled: !controlled && !!effectiveRunId && run !== null && run.status !== 'queued' && run.status !== 'paused',
  })

  const maxUsd = maxUsdProp ?? data?.budget.max_usd ?? 0
  const spentUsd = spentUsdProp ?? data?.spent_usd ?? 0
  const percent = budgetPercent(spentUsd, maxUsd)
  const level = hardStopLevel(percent)

  const [toast, setToast] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideDismissed, setOverrideDismissed] = useState(false) // bloqueio vencido (escaped)
  const [overrideValue, setOverrideValue] = useState('')
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const queryClient = useQueryClient()

  // Toast temporário (3s) quando entra no nível warn.
  useEffect(() => {
    if (level !== 'warn') return
    setToast(true)
    const t = setTimeout(() => setToast(false), 3000)
    return () => clearTimeout(t)
  }, [level])

  // Sem dados de custo (run ausente/queued/paused/erro) → empty state compacto.
  const noData = !controlled && (effectiveRunId === null || run === null || run.status === 'queued' || run.status === 'paused' || isError)
  if (noData) {
    return (
      <div data-testid="cost-bar" className={`flex items-center gap-2 ${className}`} title="Budget — sem dados de custo">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Budget</span>
        <span data-testid="cost-empty" className="text-xs text-[var(--text-dim)]">— no data</span>
      </div>
    )
  }

  const barColor =
    level === 'blocked' ? 'bg-[var(--err)]' : level === 'warn' ? 'bg-[var(--warn)]' : 'bg-[var(--info)]'

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
      setOverrideOpen(false)
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
      <div data-testid="cost-bar" className={`flex items-center gap-2 ${className}`} title={`Budget ${percent}%`}>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Budget</span>
        <div className="relative h-2 flex-1 overflow-hidden rounded bg-[var(--bg-elev-2)]">
          {/* Marcador de 80% (linha 1px --border, §3.4). */}
          {maxUsd > 0 && (
            <div aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--border)]" style={{ left: '80%' }} />
          )}
          <div className={`h-full transition-[width] duration-200 ease-out ${barColor}`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
        {isLoading && maxUsd === 0 ? (
          <span data-testid="cost-label" className="text-xs text-[var(--text-dim)]">$…</span>
        ) : (
          <span data-testid="cost-label" className={`text-xs ${labelCls}`}>
            {data?.estimated ? '~' : ''}${spentUsd} / ${maxUsd}
          </span>
        )}
        {!controlled && data && level !== 'ok' && (
          <Button size="sm" variant="subtle" onClick={() => setOverrideOpen(true)}>
            Override
          </Button>
        )}
      </div>

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
              <Button variant="primary" size="sm" onClick={() => { setOverrideDismissed(true); setOverrideOpen(true) }}>
                Give override
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de override (M-10): POST /runs/{id}/cost/override {max_usd}. */}
      <Modal open={overrideOpen} title="Budget override" onClose={() => setOverrideOpen(false)} maxWidth={400}>
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
              onChange={(e) => { setOverrideValue(e.target.value); setOverrideError(null) }}
              placeholder="e.g. 20"
              invalid={overrideError !== null}
              className="w-full"
            />
            {overrideError ? (
              <p role="alert" className="mt-1 text-xs text-[var(--err-text)]">{overrideError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOverrideOpen(false)}>
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
