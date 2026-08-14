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
  it('ghostToStep 0 ghosts every node (inspection at step 0)', () => {
    const nodes = buildNodes({}, 'kanban', 0)
    expect(nodes.every(n => n.data.ghosted)).toBe(true)
  })
  it('ghostToStep beyond order length ghosts nothing', () => {
    const nodes = buildNodes({}, 'kanban', 99)
    expect(nodes.some(n => n.data.ghosted)).toBe(false)
  })
  it('retry status with attemptCount 0 does not introduce the retry node', () => {
    const nodes = buildNodes({ retry: { status: 'approved', attemptCount: 0 } }, 'kanban', null)
    expect(nodes.map(n => n.id)).not.toContain('retry')
    expect(nodes).toHaveLength(8)
  })
  it('buildEdges returns [] for empty node set', () => {
    expect(buildEdges([])).toEqual([])
  })
  it('kanban retry node produces no retry->developer loop edge', () => {
    // No kanban retry fica na coluna linear (posição não-{1050,320}) → sem loop.
    const nodes = buildNodes({ developer: { status: 'approved', attemptCount: 2 } }, 'kanban', null)
    const edges = buildEdges(nodes)
    expect(edges.some(e => e.source === 'retry' && e.target === 'developer')).toBe(false)
  })
  it('kanban aligns all nodes horizontally in a straight line (y=120)', () => {
    const nodes = buildNodes({}, 'kanban', null)
    const ys = nodes.map(n => n.position.y)
    expect(ys.every(y => y === 120)).toBe(true)
  })
})
