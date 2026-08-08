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

// Posições do modo grafo (2D): fluxo principal em uma linha, `retry` abaixo
// de `developer` — o loop retry→developer sobe com aresta curva. Kanban usa
// colunas lineares (x = index * 260, y alternado).
const GRAPH_POS: Record<NodeType, { x: number; y: number }> = {
  entry: { x: 0, y: 80 },
  cpo: { x: 210, y: 80 },
  pm: { x: 420, y: 80 },
  tech_lead: { x: 630, y: 80 },
  test_writer: { x: 840, y: 80 },
  developer: { x: 1050, y: 80 },
  qa: { x: 1260, y: 80 },
  retry: { x: 1050, y: 320 },
  parallel_audit: { x: 1470, y: 80 },
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
    const position = mode === 'graph' ? GRAPH_POS[node] : { x: i * 260, y: 120 + (i % 2) * 80 }
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
    if (byId.has(source) && byId.has(target)) {
      edges.push({ id: `${source}->${target}`, source, target })
    }
  }
  const retry = byId.get(RETRY_NODE)
  if (retry && retry.position.x === GRAPH_POS.retry.x && retry.position.y === GRAPH_POS.retry.y) {
    edges.push({ id: `${RETRY_NODE}->developer`, source: RETRY_NODE, target: 'developer' })
  }
  return edges
}
