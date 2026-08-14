import type { NodeType, CostNode } from '../../shared/lib/types'
import type { NodeStatus } from '../../stores/canvasStore'

// ─── Modelo do DAG (puro/testável) ──────────────────────────────────────────
// O canvas NÃO guarda posições — a geometria vem daqui, derivada de
// canvasStore.nodeStatus + mode + ghostToStep (T5/T6). buildNodes/buildEdges
// são funções puras consumidas por FlowCanvas e pelos testes.

// Ordem canônica do pipeline (contrato 03 §7): nós de EXECUÇÃO + `entry`
// (virtual de apresentação — ponto de partida, sem node_execution). `retry`
// é virtual E condicional: entra no canvas apenas quando alguma tentativa
// (attemptCount) > 0 — não faz parte do backbone fixo.
export const PIPELINE_ORDER: NodeType[] = [
  'entry',
  'cpo',
  'pm',
  'tech_lead',
  'test_writer',
  'developer',
  'qa',
  'parallel_audit',
]

export const RETRY_NODE: NodeType = 'retry'

export const NODE_LABELS: Record<NodeType, string> = {
  entry: 'Entry',
  cpo: 'CPO',
  pm: 'PM',
  tech_lead: 'Tech Lead',
  test_writer: 'Test Writer',
  developer: 'Developer',
  qa: 'QA',
  retry: 'Retry',
  parallel_audit: 'Parallel Audit',
}

// Posições do modo grafo (2D): fluxo principal em linha horizontal reta (y=120),
// `retry` abaixo de `developer` (y=280) — o loop retry→developer sobe com aresta curva.
// Kanban usa colunas lineares alinhadas horizontalmente (x = index * 240, y = 120).
const GRAPH_POS: Record<NodeType, { x: number; y: number }> = {
  entry: { x: 0, y: 120 },
  cpo: { x: 220, y: 120 },
  pm: { x: 440, y: 120 },
  tech_lead: { x: 660, y: 120 },
  test_writer: { x: 880, y: 120 },
  developer: { x: 1100, y: 120 },
  qa: { x: 1320, y: 120 },
  retry: { x: 1100, y: 280 },
  parallel_audit: { x: 1540, y: 120 },
}

// type (não interface): atribuição a Record<string, unknown> exige índice
// implícito — interfaces não têm (quebra o constraint NodeProps<Node> do xyflow).
export type DagNodeData = {
  node: NodeType
  status: NodeStatus
  attemptCount: number
  ghosted: boolean
  /** Custo do nó (Fase D/UC-04) — injetado pelo FlowCanvas via cost query;
   *  o buildNodes puro não o conhece (cost é dado de servidor, não de store). */
  cost?: CostNode
}

export interface DagNode {
  id: NodeType
  type: 'agent'
  position: { x: number; y: number }
  data: DagNodeData
}

export interface DagEdge {
  id: string
  source: NodeType
  target: NodeType
  animated?: boolean
  style?: Record<string, unknown>
}

export type DagStatuses = Partial<Record<NodeType, { status: NodeStatus; attemptCount: number }>>

// Constrói os nós na ordem do pipeline. Status default: pending/0 tentativas.
// `retry` (virtual) aparece apenas quando alguma tentativa > 0 (contrato 03
// §7) — entra no backbone entre qa e parallel_audit. Ghosting (UX5):
// ghostToStep numérico = índice do step — nós com índice >= ghostToStep ficam
// ghosted (o próprio step-alvo e os futuros).
export function buildNodes(
  statuses: DagStatuses,
  mode: 'kanban' | 'graph',
  ghostToStep: number | null,
): DagNode[] {
  const hasRetry = Object.values(statuses).some((s) => s.attemptCount > 0)
  const order = hasRetry ? pipelineOrderWithRetry() : PIPELINE_ORDER
  return order.map((node, i) => {
    const entry = statuses[node] ?? { status: 'pending' as NodeStatus, attemptCount: 0 }
    const position = mode === 'graph' ? GRAPH_POS[node] : { x: i * 240, y: 120 }
    return {
      id: node,
      type: 'agent',
      position,
      data: {
        node,
        status: entry.status,
        attemptCount: entry.attemptCount,
        ghosted: ghostToStep !== null && i >= ghostToStep,
      },
    }
  })
}

// retry (virtual) entra no backbone entre qa e parallel_audit quando visível.
function pipelineOrderWithRetry(): NodeType[] {
  const idx = PIPELINE_ORDER.indexOf('parallel_audit')
  return [...PIPELINE_ORDER.slice(0, idx), RETRY_NODE, ...PIPELINE_ORDER.slice(idx)]
}

// Arestas lineares na ordem do pipeline (entry→cpo→…→parallel_audit; com
// retry visível: qa→retry→parallel_audit). Modo grafo: adiciona o loop
// retry→developer — detectado geometricamente (retry posicionado em
// GRAPH_POS.retry, abaixo do developer; no kanban retry fica na coluna
// linear, sem loop).
export function buildEdges(nodes: DagNode[]): DagEdge[] {
  const byId = new Map<string, DagNode>(nodes.map((n) => [n.id, n]))
  const edges: DagEdge[] = []
  const order = byId.has(RETRY_NODE) ? pipelineOrderWithRetry() : PIPELINE_ORDER
  for (let i = 0; i < order.length - 1; i++) {
    const source = order[i]
    const target = order[i + 1]
    const sourceNode = byId.get(source)
    const targetNode = byId.get(target)
    if (sourceNode && targetNode) {
      const isRunning = targetNode.data.status === 'running'
      edges.push({
        id: `${source}->${target}`,
        source,
        target,
        animated: isRunning,
        style: isRunning ? { stroke: 'var(--accent)', strokeWidth: 2 } : { stroke: 'var(--border)', strokeWidth: 1.5 },
      })
    }
  }
  const retry = byId.get(RETRY_NODE)
  if (retry && retry.position.x === GRAPH_POS.retry.x && retry.position.y === GRAPH_POS.retry.y) {
    const isRetryRunning = retry.data.status === 'running'
    edges.push({
      id: `${RETRY_NODE}->developer`,
      source: RETRY_NODE,
      target: 'developer',
      animated: true,
      style: isRetryRunning ? { stroke: 'var(--err)', strokeWidth: 2 } : { stroke: 'var(--accent)', strokeWidth: 1.5 },
    })
  }
  return edges
}
