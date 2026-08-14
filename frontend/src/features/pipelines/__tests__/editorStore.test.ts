import { beforeEach, describe, it, expect } from 'vitest'
import { useEditorStore } from '../editorStore'
import type { PipelineInput } from '../../../shared/lib/types'

const pipeline: PipelineInput = {
  name: 'Main flow',
  description: 'default',
  nodes: [
    { id: 'in', type: 'input', agent_id: null, config: {} },
    { id: 'dev', type: 'agent', agent_id: 'a1', config: {} },
    { id: 'out', type: 'output', agent_id: null, config: {} },
  ],
  edges: [{ source: 'in', target: 'dev', type: 'sequential', condition: null, max_retries: 0 }],
}

beforeEach(() => {
  useEditorStore.setState({ open: false, editingId: null, draft: null, live: true, selectedEdgeId: null, positions: {} })
})

describe('editorStore (S3)', () => {
  it('openPipeline preenche draft + editingId e abre em modo edição', () => {
    useEditorStore.getState().openPipeline('p1', pipeline)
    const s = useEditorStore.getState()
    expect(s.open).toBe(true)
    expect(s.live).toBe(false)
    expect(s.editingId).toBe('p1')
    expect(s.draft).toEqual(pipeline)
  })

  it('newPipeline cria draft vazio (sem id) e abre', () => {
    useEditorStore.getState().newPipeline()
    const s = useEditorStore.getState()
    expect(s.open).toBe(true)
    expect(s.live).toBe(false)
    expect(s.editingId).toBeNull()
    expect(s.draft).toEqual({ name: '', description: '', nodes: [], edges: [] })
  })

  it('close fecha e zera estado', () => {
    useEditorStore.getState().openPipeline('p1', pipeline)
    useEditorStore.getState().close()
    const s = useEditorStore.getState()
    expect(s.open).toBe(false)
    expect(s.draft).toBeNull()
    expect(s.editingId).toBeNull()
    expect(s.live).toBe(true)
  })

  it('setLive alterna live/edição sem perder draft', () => {
    useEditorStore.getState().openPipeline('p1', pipeline)
    useEditorStore.getState().setLive(true)
    expect(useEditorStore.getState().live).toBe(true)
    expect(useEditorStore.getState().draft).toEqual(pipeline)
    useEditorStore.getState().setLive(false)
    expect(useEditorStore.getState().live).toBe(false)
  })

  it('addNode adiciona ao draft com id único e posição no próximo slot', () => {
    useEditorStore.getState().newPipeline()
    useEditorStore.getState().addNode('split')
    useEditorStore.getState().addNode('agent', 'a1')
    const s = useEditorStore.getState()
    expect(s.draft!.nodes).toHaveLength(2)
    expect(s.draft!.nodes[0].type).toBe('split')
    expect(s.draft!.nodes[0].agent_id).toBeNull()
    expect(s.draft!.nodes[1].type).toBe('agent')
    expect(s.draft!.nodes[1].agent_id).toBe('a1')
    expect(s.draft!.nodes[0].id).not.toBe(s.draft!.nodes[1].id)
    // Posições em grade (3 colunas).
    expect(s.positions[s.draft!.nodes[0].id]).toEqual({ x: 0, y: 0 })
    expect(s.positions[s.draft!.nodes[1].id]).toEqual({ x: 280, y: 0 })
  })

  it('removeNode remove o nó e as edges incidentes', () => {
    useEditorStore.getState().openPipeline('p1', pipeline)
    useEditorStore.getState().removeNode('dev')
    const s = useEditorStore.getState()
    expect(s.draft!.nodes.map((n) => n.id)).toEqual(['in', 'out'])
    expect(s.draft!.edges).toEqual([]) // in->dev removida (dev era target)
  })

  it('addEdge adiciona edge sequential com defaults; duplicata é no-op', () => {
    useEditorStore.getState().newPipeline()
    useEditorStore.getState().addNode('input')
    useEditorStore.getState().addNode('output')
    const { draft } = useEditorStore.getState()
    const a = draft!.nodes[0].id
    const b = draft!.nodes[1].id
    useEditorStore.getState().addEdge(a, b)
    useEditorStore.getState().addEdge(a, b) // dup
    expect(useEditorStore.getState().draft!.edges).toEqual([{ source: a, target: b, type: 'sequential', condition: null, max_retries: 0 }])
  })

  it('updateEdge aplica patch (type/condition/max_retries)', () => {
    useEditorStore.getState().openPipeline('p1', pipeline)
    const id = 'in->dev'
    useEditorStore.getState().updateEdge(id, { type: 'retry', max_retries: 3 })
    const e = useEditorStore.getState().draft!.edges[0]
    expect(e).toEqual({ source: 'in', target: 'dev', type: 'retry', condition: null, max_retries: 3 })
  })

  it('setSelectedEdgeId controla o EdgeConfigDrawer', () => {
    useEditorStore.getState().openPipeline('p1', pipeline)
    useEditorStore.getState().setSelectedEdgeId('in->dev')
    expect(useEditorStore.getState().selectedEdgeId).toBe('in->dev')
    useEditorStore.getState().setSelectedEdgeId(null)
    expect(useEditorStore.getState().selectedEdgeId).toBeNull()
  })

  it('setPosition persiste posição de drag', () => {
    useEditorStore.getState().newPipeline()
    useEditorStore.getState().addNode('input')
    const id = useEditorStore.getState().draft!.nodes[0].id
    useEditorStore.getState().setPosition(id, { x: 999, y: 42 })
    expect(useEditorStore.getState().positions[id]).toEqual({ x: 999, y: 42 })
  })
})
