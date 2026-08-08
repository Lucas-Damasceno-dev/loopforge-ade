import type { CostNode } from '../../shared/lib/types'

// Modelo puro de custos (testável). O custo REAL por nó vem do backend via
// GET /api/v1/runs/{id}/cost → CostResponse.nodes (Fase D/UC-04, aditivo
// default []) — agrupado pelo nome canônico do nó (developer, qa, …).

// Custo do nó: spent_usd do CostNode com node === nome (0 se ausente).
// Comparação por nome canônico (mesmo vocabulário do backend/ws NODE_MAP).
export function costForNode(nodes: CostNode[] | undefined, node: string): number {
  if (!Array.isArray(nodes)) return 0
  return nodes.find((n) => n.node === node)?.spent_usd ?? 0
}

// Formata USD p/ exibição compacta no chip ($0.12, $1.5 → $1.50? mantém 2
// casas como o backend reporta — custo por nó é fracionário).
export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
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
