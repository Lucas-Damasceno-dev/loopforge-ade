import { describe, it, expect } from 'vitest'
import type { NodeType } from '../../../shared/lib/types'
import { nodeAccentTextVar } from '../nodeAccent'

// Variantes -text (auditoria P0): rótulo do nó usa a variante clara quando a
// base fica <4.5:1 sobre --bg-elev — agora TODOS os nós têm variante própria.
describe('nodeAccentTextVar', () => {
  it('usa variante -text para todos os nós com contraste insuficiente', () => {
    expect(nodeAccentTextVar('pm')).toBe('var(--node-pm-text)')
    expect(nodeAccentTextVar('test_writer')).toBe('var(--node-test-writer-text)')
    expect(nodeAccentTextVar('developer')).toBe('var(--node-developer-text)')
    expect(nodeAccentTextVar('qa')).toBe('var(--node-qa-text)')
    expect(nodeAccentTextVar('retry')).toBe('var(--node-retry-text)')
    expect(nodeAccentTextVar('parallel_audit')).toBe('var(--node-parallel-audit-text)')
  })

  it('mantém as variantes existentes e o fallback de base', () => {
    expect(nodeAccentTextVar('entry')).toBe('var(--node-entry-text)')
    expect(nodeAccentTextVar('cpo')).toBe('var(--accent-text)')
    expect(nodeAccentTextVar('tech_lead')).toBe('var(--node-tech-lead-text)')
    expect(nodeAccentTextVar('terminal' as NodeType)).toBe('var(--node-terminal)')
  })
})
