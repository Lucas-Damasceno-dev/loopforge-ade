import { describe, it, expect } from 'vitest'
import { buildNodes, buildEdges, PIPELINE_ORDER } from '../dagModel'

describe('dagModel', () => {
  it('kanban builds 8 nodes (no retry) without attempts', () => {
    const nodes = buildNodes({}, 'kanban', null)
    expect(nodes.map(n => n.id)).toEqual(PIPELINE_ORDER)
    expect(nodes).toHaveLength(8)
  })
  it('kanban adds virtual retry node when attemptCount > 0', () => {
    const nodes = buildNodes({ developer: { status: 'approved', attemptCount: 2 } }, 'kanban', null)
    const ids = nodes.map(n => n.id)
    expect(ids).toHaveLength(9)
    expect(ids).toContain('retry')
    // retry entra entre qa e parallel_audit (backbone canônico).
    expect(ids).toEqual(['entry', 'cpo', 'pm', 'tech_lead', 'test_writer', 'developer', 'qa', 'retry', 'parallel_audit'])
  })
  it('kanban layout is linear columns (x increases)', () => {
    const nodes = buildNodes({}, 'kanban', null)
    const xs = nodes.map(n => n.position.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })
  it('graph mode adds retry->developer edge when retry visible', () => {
    const edges = buildEdges(buildNodes({ developer: { status: 'approved', attemptCount: 2 } }, 'graph', null))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'retry', target: 'developer' }))
  })
  it('graph mode has no retry edges without attempts', () => {
    const edges = buildEdges(buildNodes({}, 'graph', null))
    expect(edges.some(e => e.source === 'retry' || e.target === 'retry')).toBe(false)
  })
  it('ghosts future nodes', () => {
    const nodes = buildNodes({}, 'kanban', 3)
    const ghosted = nodes.filter(n => n.data.ghosted)
    expect(ghosted).toHaveLength(5) // índices 3..7 (8 nós, sem retry)
    expect(nodes[2].data.ghosted).toBe(false)
  })
})
