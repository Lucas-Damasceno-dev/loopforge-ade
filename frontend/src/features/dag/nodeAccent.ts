import type { NodeType } from '../../shared/lib/types'

// Acentos por tipo de nó (01b §2.2). Kebab-case no CSS (--node-tech-lead)
// mapeia o NodeType snake_case.
export function nodeAccentVar(node: NodeType): string {
  return `var(--node-${node.replaceAll('_', '-')})`
}

// Variantes -text para o RÓTULO do nó (texto): quando a base fica <4.5:1
// sobre --bg-elev, o rótulo usa OBRIGATORIAMENTE a variante clara (entry
// 3.7:1, cpo 2.8:1, tech_lead 4.2:1). Demais nós usam a base (AA).
const TEXT_VARIANTS: Partial<Record<NodeType, string>> = {
  entry: 'var(--node-entry-text)',
  cpo: 'var(--accent-text)',
  tech_lead: 'var(--node-tech-lead-text)',
}

export function nodeAccentTextVar(node: NodeType): string {
  return TEXT_VARIANTS[node] ?? nodeAccentVar(node)
}
