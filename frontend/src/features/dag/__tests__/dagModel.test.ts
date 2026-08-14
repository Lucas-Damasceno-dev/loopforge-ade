import { describe, it, expect } from 'vitest'
import { buildNodes, buildEdges, PIPELINE_ORDER, DISPLAY_ORDER } from '../dagModel'

describe('dagModel', () => {
  it('kanban builds 11 display nodes (no retry) without attempts', () => {
    const nodes = buildNodes({}, 'kanban', null)
    expect(nodes.map(n => n.id)).toEqual(DISPLAY_ORDER)
    expect(nodes).toHaveLength(11)
  })
  it('kanban adds virtual retry node when attemptCount > 0', () => {
    const nodes = buildNodes({ developer: { status: 'approved', attemptCount: 2 } }, 'kanban', null)
    const ids = nodes.map(n => n.id)
    expect(ids).toHaveLength(12)
    expect(ids).toContain('retry')
    // retry entra entre qa e split (sub-grafo paralelo no display).
    expect(ids).toEqual(['entry', 'cpo', 'pm', 'tech_lead', 'test_writer', 'developer', 'qa', 'retry', 'split', 'appsec', 'devops', 'merge'])
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
  it('ghosts future nodes by EXECUTION index (sub-graph ghosts with parallel_audit)', () => {
    const nodes = buildNodes({}, 'kanban', 3)
    const ghosted = nodes.filter(n => n.data.ghosted)
    // execIndex: entry0..qa6, display block herda 7 → 8 nós ghosted.
    expect(ghosted).toHaveLength(8)
    expect(nodes[2].data.ghosted).toBe(false) // pm (execIndex 2)
    expect(nodes[3].data.ghosted).toBe(true) // tech_lead (execIndex 3)
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
    expect(nodes).toHaveLength(11)
  })
  it('buildEdges returns [] for empty node set', () => {
    expect(buildEdges([])).toEqual([])
  })
  it('kanban retry node produces no retry->developer loop edge', () => {
    // No kanban retry fica na coluna linear (posição não-{1100,280}) → sem loop.
    const nodes = buildNodes({ developer: { status: 'approved', attemptCount: 2 } }, 'kanban', null)
    const edges = buildEdges(nodes)
    expect(edges.some(e => e.source === 'retry' && e.target === 'developer')).toBe(false)
  })
  it('kanban aligns all nodes horizontally in a straight line (y=120)', () => {
    const nodes = buildNodes({}, 'kanban', null)
    const ys = nodes.map(n => n.position.y)
    expect(ys.every(y => y === 120)).toBe(true)
  })

  // ─── S4: sub-grafo split (display) ─────────────────────────────────────

  it('(a) graph mode builds display ids entry..qa,split,appsec,devops,merge', () => {
    const nodes = buildNodes({}, 'graph', null)
    expect(nodes.map(n => n.id)).toEqual(['entry', 'cpo', 'pm', 'tech_lead', 'test_writer', 'developer', 'qa', 'split', 'appsec', 'devops', 'merge'])
  })
  it('(b) graph positions: appsec {1760,60}, devops {1760,180}, merge {1980,120}', () => {
    const nodes = buildNodes({}, 'graph', null)
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
    expect(byId['appsec'].position).toEqual({ x: 1760, y: 60 })
    expect(byId['devops'].position).toEqual({ x: 1760, y: 180 })
    expect(byId['merge'].position).toEqual({ x: 1980, y: 120 })
    expect(byId['split'].position).toEqual({ x: 1540, y: 120 })
  })
  it('(c) ghostToStep 7 ghosts sub-graph (execIndex do pai parallel_audit), qa não', () => {
    const nodes = buildNodes({ parallel_audit: { status: 'running', attemptCount: 0 } }, 'graph', 7)
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
    for (const id of ['split', 'appsec', 'devops', 'merge']) {
      expect(byId[id].data.ghosted).toBe(true)
      expect(byId[id].data.execIndex).toBe(7)
    }
    expect(byId['qa'].data.ghosted).toBe(false)
    expect(byId['qa'].data.execIndex).toBe(6)
  })
  it('(d) sub-graph nodes inherit status/attemptCount from parallel_audit', () => {
    const nodes = buildNodes({ parallel_audit: { status: 'running', attemptCount: 2 } }, 'graph', null)
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
    for (const id of ['split', 'appsec', 'devops', 'merge']) {
      expect(byId[id].data.status).toBe('running')
      expect(byId[id].data.attemptCount).toBe(2)
    }
  })
  it('(e) retry visible → ids incluem retry entre qa e split', () => {
    const nodes = buildNodes({ qa: { status: 'approved', attemptCount: 1 } }, 'graph', null)
    const ids = nodes.map(n => n.id)
    const qaIdx = ids.indexOf('qa')
    const retryIdx = ids.indexOf('retry')
    const splitIdx = ids.indexOf('split')
    expect(ids).toContain('retry')
    expect(qaIdx).toBeGreaterThanOrEqual(0)
    expect(retryIdx).toBe(qaIdx + 1)
    expect(splitIdx).toBe(retryIdx + 1)
  })
  it('(f) edges: split fan-out com handles, sem split->merge', () => {
    const edges = buildEdges(buildNodes({}, 'graph', null))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'split', target: 'appsec', sourceHandle: 'a' }))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'split', target: 'devops', sourceHandle: 'b' }))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'appsec', target: 'merge', targetHandle: 'a' }))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'devops', target: 'merge', targetHandle: 'b' }))
    expect(edges).toContainEqual(expect.objectContaining({ source: 'qa', target: 'split' }))
    expect(edges.some(e => e.source === 'split' && e.target === 'merge')).toBe(false)
    expect(edges.some(e => e.source === 'appsec' && e.target === 'devops')).toBe(false)
  })
  it('(g) retry child devops->split dashed (graph); ausente no kanban', () => {
    const graphEdges = buildEdges(buildNodes({ parallel_audit: { status: 'rejected', attemptCount: 2 } }, 'graph', null))
    const retryChild = graphEdges.find(e => e.id === 'retry-devops->split')
    expect(retryChild).toBeDefined()
    expect(retryChild!.dashed).toBe(true)
    expect(retryChild!.animated).toBe(true)
    expect(retryChild!.sourcePosition).toBe('bottom')
    expect(retryChild!.targetPosition).toBe('bottom')
    expect(retryChild!.style).toEqual({ stroke: 'var(--err)', strokeWidth: 1.5, strokeDasharray: '6 4' })

    const kanbanEdges = buildEdges(buildNodes({ parallel_audit: { status: 'rejected', attemptCount: 2 } }, 'kanban', null))
    expect(kanbanEdges.some(e => e.id === 'retry-devops->split')).toBe(false)
  })
  it('PIPELINE_ORDER permanece ordem de EXECUÇÃO (8 nós, parallel_audit)', () => {
    expect(PIPELINE_ORDER).toEqual(['entry', 'cpo', 'pm', 'tech_lead', 'test_writer', 'developer', 'qa', 'parallel_audit'])
    expect(PIPELINE_ORDER).toHaveLength(8)
  })
})
