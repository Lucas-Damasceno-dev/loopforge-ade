// Modelo puro de custos (testável). costForNode é placeholder — a telemetria
// por nó ainda não chega ao frontend (V2); o custo REAL por run vem do
// backend via GET /api/v1/runs/{id}/cost (CostResponse).
export function costForNode(_statuses: unknown): number {
  // Parâmetro mantido p/ a assinatura futura (telemetria V2) — V1 retorna 0.
  void _statuses
  return 0
}

export function budgetPercent(spentUsd: number, maxUsd: number): number {
  if (maxUsd <= 0) return 0
  return Math.round((spentUsd / maxUsd) * 100)
}

export function hardStopLevel(percent: number): 'ok' | 'warn' | 'blocked' {
  if (percent >= 100) return 'blocked'
  if (percent >= 80) return 'warn'
  return 'ok'
}

// Valida o input do override (BudgetOverrideRequest.max_usd > 0).
// Retorna o valor numérico ou um erro de validação (exibido em --err-text).
export function parseMaxUsd(input: string): { value: number } | { error: string } {
  const trimmed = input.trim()
  if (!trimmed) return { error: 'Informe um valor' }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return { error: 'Valor deve ser numérico e maior que zero' }
  return { value }
}
