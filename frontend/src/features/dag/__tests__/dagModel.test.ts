import { describe, it, expect } from 'vitest'
import { buildNodes, buildEdges, PIPELINE_ORDER } from '../dagModel'

describe('dagModel', () => {
  it('kanban builds 9 nodes in pipeline order', () => {
    const nodes = buildNodes({}, 'kanban', null)
    expect(nodes.map(n => n.id)).toEqual(PIPELINE_ORDER)
    expect(nodes).toHaveLength(9)
  })
  it('kanban layout is linear columns (x increases)', () => {
    const nodes = buildNodes({}, 'kanban', null)
    const xs = nodes.map(n => n.position.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })
  it('graph mode adds retry->dev edge', () => {
    const edges = buildEdges(buildNodes({}, 'graph', null))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'retry', target: 'dev' }))
  })
  it('ghosts future nodes', () => {
    const nodes = buildNodes({}, 'kanban', 3)
    const ghosted = nodes.filter(n => n.data.ghosted)
    expect(ghosted).toHaveLength(6) // índices 3..8
    expect(nodes[2].data.ghosted).toBe(false)
  })
})
