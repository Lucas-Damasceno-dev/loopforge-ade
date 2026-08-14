import type { Node, Edge } from '@xyflow/react'
import type { PipelineInput, PipelineNode, PipelineEdge, PipelineNodeType, PipelineEdgeType, NodeType } from '../../shared/lib/types'
import { NODE_LABELS } from '../dag/dagModel'

// ─── Modelo do editor de pipelines (puro/testável) ──────────────────────────
// Converte PipelineInput (contrato S3 T1/T2) ↔ nós/edges do React Flow no modo
// edição do canvas. Input/output/gate fazem parte do NodeType (S3) e renderizam
// com o AgentNode (nodeType 'agent'); split/merge reusam SplitNode/MergeNode
// (S4). O round-trip preserva a meta do pipeline (type/agent_id/config/
// condition/max_retries) embutida no data de cada node/edge.

// Grade do editor: 3 colunas, 280×160.
export const GRID = { cols: 3, dx: 280, dy: 160 }

export const PIPELINE_TYPE_LABEL: Record<PipelineNodeType, string> = {
  agent: 'Agent',
  split: 'Split',
  merge: 'Merge',
  input: 'Input',
  output: 'Output',
  gate: 'Gate',
}

export interface EditorNodeData extends Record<string, unknown> {
  /** Tipo do nó (NodeType do DAG — input/output/gate existem no modo edição). */
  node: NodeType
  /** Label de exibição (agente pelo nome; tipos via NODE_LABELS/PIPELINE_TYPE_LABEL). */
  label: string
  status: 'pending'
  attemptCount: number
  ghosted: boolean
  execIndex: number
  /** Meta do pipeline preservada p/ round-trip (nodesToPipeline). */
  agent_id: string | null
  config: Record<string, unknown>
}

export type EditorNode = Node<EditorNodeData>
export type EditorEdge = Edge<{ type: PipelineEdgeType; condition: string | null; max_retries: number }> & {
  /** Tracejada (retry — mesmo padrão do DAG live). Campo custom do projeto. */
  dashed?: boolean
}

/** Posição em grade (slot i) — sobreposta por positions do editorStore. */
function gridPos(i: number): { x: number; y: number } {
  return { x: (i % GRID.cols) * GRID.dx, y: Math.floor(i / GRID.cols) * GRID.dy }
}

function rfType(t: PipelineNodeType): 'agent' | 'split' | 'merge' {
  if (t === 'split') return 'split'
  if (t === 'merge') return 'merge'
  return 'agent'
}

/** PipelineInput → nós do React Flow (grade + meta embutida no data). */
export function pipelineToNodes(pipeline: PipelineInput, positions: Record<string, { x: number; y: number }> = {}): EditorNode[] {
  return pipeline.nodes.map((pn, i) => ({
    id: pn.id,
    type: rfType(pn.type),
    position: positions[pn.id] ?? gridPos(i),
    data: {
      node: pn.type as NodeType,
      label: labelFor(pn),
      status: 'pending',
      attemptCount: 0,
      ghosted: false,
      execIndex: 0,
      agent_id: pn.agent_id,
      config: pn.config,
    },
  }))
}

/** Label do nó do editor: agente → nome do agente (quando resolvido pelo
 *  caller via `agents`); tipos → NODE_LABELS (input/output/gate inclusos) com
 *  fallback no monograma do tipo. */
export function labelFor(pn: PipelineNode, agentName?: string | null): string {
  if (pn.type === 'agent' && agentName) return agentName
  return NODE_LABELS[pn.type as NodeType] ?? PIPELINE_TYPE_LABEL[pn.type]
}

/**
 * PipelineInput → edges do React Flow. sourceHandle/targetHandle seguem o S4
 * (split a=topo/b=base; merge a=topo/b=base — por ordem de aparição). retry →
 * tracejada (dashed + err, mesmo padrão do DAG). Meta (type/condition/
 * max_retries) embutida no data p/ round-trip.
 */
export function pipelineToEdges(pipeline: PipelineInput): EditorEdge[] {
  const splitOut = new Map<string, number>()
  const mergeIn = new Map<string, number>()
  return pipeline.edges.map((pe) => {
    let sourceHandle: string | undefined
    let targetHandle: string | undefined
    if (pe.type === 'parallel') {
      // fan-out: split → filhos sequenciais (a, b, …); fan-in: → merge.
      const from = pipeline.nodes.find((n) => n.id === pe.source)
      const to = pipeline.nodes.find((n) => n.id === pe.target)
      if (from?.type === 'split') {
        const n = splitOut.get(pe.source) ?? 0
        splitOut.set(pe.source, n + 1)
        sourceHandle = String.fromCharCode(97 + n)
      }
      if (to?.type === 'merge') {
        const n = mergeIn.get(pe.target) ?? 0
        mergeIn.set(pe.target, n + 1)
        targetHandle = String.fromCharCode(97 + n)
      }
    }
    return {
      id: `${pe.source}->${pe.target}`,
      source: pe.source,
      target: pe.target,
      sourceHandle,
      targetHandle,
      ...(pe.type === 'retry'
        ? { dashed: true, animated: true, style: { stroke: 'var(--err)', strokeWidth: 1.5, strokeDasharray: '6 4' } }
        : {}),
      data: { type: pe.type, condition: pe.condition, max_retries: pe.max_retries },
    }
  })
}

/**
 * Nós+edges do React Flow → PipelineInput (inverso). Edge sem data (criada por
 * connect no canvas) ganha defaults: sequential/null/0. IDs únicos preservados.
 */
export function nodesToPipeline(nodes: EditorNode[], edges: EditorEdge[], name: string, description: string): PipelineInput {
  const seen = new Set<string>()
  const pnodes: PipelineNode[] = nodes.map((n) => {
    const type = (n.data.node ?? 'agent') as PipelineNodeType
    if (seen.has(n.id)) throw new Error(`Duplicate node id: ${n.id}`)
    seen.add(n.id)
    return {
      id: n.id,
      type,
      agent_id: n.data.agent_id ?? null,
      config: n.data.config ?? {},
    }
  })
  const pedges: PipelineEdge[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.data?.type ?? 'sequential',
    condition: e.data?.condition ?? null,
    max_retries: e.data?.max_retries ?? 0,
  }))
  return { name, description, nodes: pnodes, edges: pedges }
}

export function nodeAt(nodes: EditorNode[], id: string): EditorNode | undefined {
  return nodes.find((n) => n.id === id)
}

export function edgeBetween(edges: EditorEdge[], source: string, target: string): EditorEdge | undefined {
  return edges.find((e) => e.source === source && e.target === target)
}
