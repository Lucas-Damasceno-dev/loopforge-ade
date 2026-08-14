import { describe, it, expect } from 'vitest'
import { pipelineToNodes, pipelineToEdges, nodesToPipeline, nodeAt, edgeBetween } from '../editorModel'
import type { PipelineInput } from '../../../shared/lib/types'

// Fixture de pipeline (contrato S3 T1/T2): tipos de nó do editor + edges de
// todos os tipos. agent usa agent_id; split/merge com fan-out/fan-in.
const pipeline: PipelineInput = {
  name: 'Main flow',
  description: 'default',
  nodes: [
    { id: 'in', type: 'input', agent_id: null, config: {} },
    { id: 'dev', type: 'agent', agent_id: 'a1', config: { temperature: 0.5 } },
    { id: 'split1', type: 'split', agent_id: null, config: {} },
    { id: 'sec', type: 'agent', agent_id: 'a2', config: {} },
    { id: 'qa', type: 'agent', agent_id: 'a3', config: {} },
    { id: 'merge1', type: 'merge', agent_id: null, config: {} },
    { id: 'out', type: 'output', agent_id: null, config: {} },
    { id: 'gate1', type: 'gate', agent_id: null, config: {} },
  ],
  edges: [
    { source: 'in', target: 'dev', type: 'sequential', condition: null, max_retries: 0 },
    { source: 'dev', target: 'split1', type: 'sequential', condition: null, max_retries: 0 },
    { source: 'split1', target: 'sec', type: 'parallel', condition: null, max_retries: 0 },
    { source: 'split1', target: 'qa', type: 'parallel', condition: null, max_retries: 0 },
    { source: 'sec', target: 'merge1', type: 'parallel', condition: null, max_retries: 0 },
    { source: 'qa', target: 'merge1', type: 'parallel', condition: null, max_retries: 0 },
    { source: 'merge1', target: 'gate1', type: 'conditional', condition: 'score > 0.8', max_retries: 0 },
    { source: 'gate1', target: 'out', type: 'retry', condition: null, max_retries: 3 },
  ],
}

describe('editorModel (S3)', () => {
  it('pipelineToNodes mapeia todos os tipos e gera posições em grade', () => {
    const nodes = pipelineToNodes(pipeline)
    expect(nodes).toHaveLength(8)
    // input/output/gate → nodeType agent (AgentNode) com label próprio.
    const inNode = nodes.find((n) => n.id === 'in')!
    expect(inNode.type).toBe('agent')
    expect(inNode.data.label).toBe('Input')
    expect(nodes.find((n) => n.id === 'split1')!.type).toBe('split')
    expect(nodes.find((n) => n.id === 'merge1')!.type).toBe('merge')
    expect(nodes.find((n) => n.id === 'gate1')!.type).toBe('agent')
    // Grade: 3 colunas — index 0 → (0,0), index 3 → (0,160).
    expect(nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(nodes[3].position).toEqual({ x: 0, y: 160 })
    expect(nodes[1].position).toEqual({ x: 280, y: 0 })
  })

  it('pipelineToNodes embute agent_id/config no data (round-trip)', () => {
    const nodes = pipelineToNodes(pipeline)
    const dev = nodes.find((n) => n.id === 'dev')!
    expect(dev.data.agent_id).toBe('a1')
    expect(dev.data.config).toEqual({ temperature: 0.5 })
  })

  it('pipelineToEdges: retry → dashed + err, handles split a/b e merge a/b', () => {
    const edges = pipelineToEdges(pipeline)
    expect(edges).toHaveLength(8)
    const retry = edges.find((e) => e.id === 'gate1->out')!
    expect(retry.dashed).toBe(true)
    expect(retry.style).toMatchObject({ strokeDasharray: '6 4' })
    expect(edges.find((e) => e.source === 'split1' && e.target === 'sec')!.sourceHandle).toBe('a')
    expect(edges.find((e) => e.source === 'split1' && e.target === 'qa')!.sourceHandle).toBe('b')
    expect(edges.find((e) => e.target === 'merge1' && e.source === 'sec')!.targetHandle).toBe('a')
    expect(edges.find((e) => e.target === 'merge1' && e.source === 'qa')!.targetHandle).toBe('b')
    // Meta da edge (type/condition/max_retries) embutida p/ round-trip.
    const cond = edges.find((e) => e.id === 'merge1->gate1')!
    expect(cond.data).toEqual({ type: 'conditional', condition: 'score > 0.8', max_retries: 0 })
  })

  it('round-trip: pipeline → nodes+edges → pipeline preserva ids, tipos e meta', () => {
    const nodes = pipelineToNodes(pipeline)
    const edges = pipelineToEdges(pipeline)
    const back = nodesToPipeline(nodes, edges, pipeline.name, pipeline.description)
    expect(back).toEqual(pipeline)
  })

  it('nodesToPipeline: edge criada por connect (sem data) ganha defaults', () => {
    const nodes = pipelineToNodes(pipeline)
    const fresh = [{ id: 'dev->out', source: 'dev', target: 'out' }] as unknown as Parameters<typeof pipelineToEdges>[0]
    const back = nodesToPipeline(nodes, fresh as never, 'x', '')
    expect(back.edges[0]).toEqual({ source: 'dev', target: 'out', type: 'sequential', condition: null, max_retries: 0 })
  })

  it('nodesToPipeline: edge com meta parcial (só connect) usa defaults do tipo', () => {
    const nodes = pipelineToNodes(pipeline)
    // edge de connect: sem data → sequential/null/0 (default).
    const connectEdge = { id: 'dev->qa', source: 'dev', target: 'qa' }
    const back = nodesToPipeline(nodes, [connectEdge as never], 'x', '')
    expect(back.edges).toHaveLength(1)
    expect(back.edges[0]).toEqual({ source: 'dev', target: 'qa', type: 'sequential', condition: null, max_retries: 0 })
  })

  it('nodeAt/edgeBetween: helpers de lookup do editor', () => {
    const nodes = pipelineToNodes(pipeline)
    const edges = pipelineToEdges(pipeline)
    expect(nodeAt(nodes, 'dev')?.data.agent_id).toBe('a1')
    expect(edgeBetween(edges, 'dev', 'split1')).toBeDefined()
    expect(edgeBetween(edges, 'dev', 'qa')).toBeUndefined()
  })
})
