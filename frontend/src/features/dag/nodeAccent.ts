import type { NodeType } from '../../shared/lib/types'

// Acentos por tipo de nó (01b §2.2). Kebab-case no CSS (--node-tech-lead)
// mapeia o NodeType snake_case.
export function nodeAccentVar(node: NodeType): string {
  return `var(--node-${node.replaceAll('_', '-')})`
}

// Variantes -text para o RÓTULO do nó (texto): quando a base fica <4.5:1
// sobre --bg-elev, o rótulo usa OBRIGATORIAMENTE a variante clara (auditoria
// P0: pm/test_writer/developer/qa/retry/parallel_audit também falhavam AA).
const TEXT_VARIANTS: Partial<Record<NodeType, string>> = {
  entry: 'var(--node-entry-text)',
  cpo: 'var(--accent-text)',
  pm: 'var(--node-pm-text)',
  tech_lead: 'var(--node-tech-lead-text)',
  test_writer: 'var(--node-test-writer-text)',
  developer: 'var(--node-developer-text)',
  qa: 'var(--node-qa-text)',
  retry: 'var(--node-retry-text)',
  parallel_audit: 'var(--node-parallel-audit-text)',
  // S4: filhos do sub-grafo (display-only) — variantes claras próprias.
  appsec: 'var(--node-appsec-text)',
  devops: 'var(--node-devops-text)',
  // S4: split/merge (gateways do bloco) — variantes próprias.
  split: 'var(--node-split-text)',
  merge: 'var(--node-merge-text)',
}

export function nodeAccentTextVar(node: NodeType): string {
  return TEXT_VARIANTS[node] ?? nodeAccentVar(node)
}
