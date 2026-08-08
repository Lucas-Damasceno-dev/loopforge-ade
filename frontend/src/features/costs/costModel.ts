// Modelo puro de custos (testável). V1: a telemetria de custo NÃO chega ao
// frontend (wire não a expõe) — spentUsd é 0 e costForNode é placeholder.
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
