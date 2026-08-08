import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConfig } from '../../shared/lib/api'
import { Banner } from '../../shared/ui/Banner'
import { Button } from '../../shared/ui/Button'
import { Modal } from '../../shared/ui/Modal'
import { budgetPercent, hardStopLevel } from './costModel'

// Barra de orçamento global (UX12): sempre visível. V1: spentUsd = 0 (a
// telemetria de custo não está no wire); max_usd vem do getConfig quando a
// prop não é passada (testes passam diretamente). warn (≥80%) → toast
// temporário (UX13); blocked (≥100%) → modal bloqueante com "Give override"
// (enforcement com escape consciente — estado local persiste na sessão).
//
// Cores (01b §3.4): <80% --info (estado informativo, NÃO o acento global —
// preserva §1.2 "cor = significado"); 80–99% --warn; ≥100% --err.
export function CostBar({
  maxUsd: maxUsdProp,
  spentUsd = 0,
  className = '',
}: {
  maxUsd?: number
  spentUsd?: number
  className?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['cost-config'],
    queryFn: getConfig,
    enabled: maxUsdProp === undefined,
  })
  const maxUsd = maxUsdProp ?? data?.budget.max_usd ?? 0
  const percent = budgetPercent(spentUsd, maxUsd)
  const level = hardStopLevel(percent)
  const [override, setOverride] = useState(false)
  const [toast, setToast] = useState(false)

  // Toast temporário (3s) quando entra no nível warn.
  useEffect(() => {
    if (level !== 'warn') return
    setToast(true)
    const t = setTimeout(() => setToast(false), 3000)
    return () => clearTimeout(t)
  }, [level])

  const barColor =
    level === 'blocked' ? 'bg-[var(--err)]' : level === 'warn' ? 'bg-[var(--warn)]' : 'bg-[var(--info)]'

  // Usado > total → rótulo em --err-text (01b §3.4).
  const overBudget = maxUsd > 0 && spentUsd > maxUsd
  const labelCls = overBudget ? 'text-[var(--err-text)]' : 'text-[var(--text-dim)]'

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
          <span data-testid="cost-label" className="text-xs text-[var(--text-dim)]">
            $…
          </span>
        ) : (
          <span data-testid="cost-label" className={`text-xs ${labelCls}`}>
            ${spentUsd} / ${maxUsd}
          </span>
        )}
      </div>
      {/* Modal de enforcement — bloqueante, NÃO fecha por Esc/overlay: o
          usuário precisa decidir (override) conscientemente. */}
      {level === 'blocked' && !override && (
        <Modal open title="Budget limit reached" maxWidth={400}>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-[var(--text)]">Budget limit reached</h2>
            <p className="mt-1 text-sm text-[var(--text-dim)]">
              Spent ${spentUsd} of ${maxUsd} ({percent}%). New runs are blocked.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setOverride(true)}>
                Give override
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
