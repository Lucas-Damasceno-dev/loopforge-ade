import type { NodeType } from '../../shared/lib/types'
import type { NodeStatus } from '../../stores/canvasStore'

// ─── Modelo do DAG (puro/testável) ──────────────────────────────────────────
// O canvas NÃO guarda posições — a geometria vem daqui, derivada de
// canvasStore.nodeStatus + mode + ghostToStep (T5/T6). buildNodes/buildEdges
// são funções puras consumidas por FlowCanvas e pelos testes.

export const PIPELINE_ORDER: NodeType[] = [
  'entry',
  'cpo',
  'pm',
  'tech_lead',
  'test_writer',
  'dev',
  'qa',
  'retry',
  'parallel_audit',
]

export const NODE_LABELS: Record<NodeType, string> = {
  entry: 'Entry',
  cpo: 'CPO',
  pm: 'PM',
  tech_lead: 'Tech Lead',
  test_writer: 'Test Writer',
  dev: 'Dev',
  qa: 'QA',
  retry: 'Retry',
  parallel_audit: 'Parallel Audit',
}

// Posições do modo grafo (2D): fluxo principal em uma linha, `retry` abaixo
// de `dev` — o loop retry→dev sobe com aresta curva. Kanban usa colunas
// lineares (x = index * 260, y alternado).
const GRAPH_POS: Record<NodeType, { x: number; y: number }> = {
  entry: { x: 0, y: 80 },
  cpo: { x: 210, y: 80 },
  pm: { x: 420, y: 80 },
  tech_lead: { x: 630, y: 80 },
  test_writer: { x: 840, y: 80 },
  dev: { x: 1050, y: 80 },
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
// Ghosting (UX5): ghostToStep numérico = índice do step — nós com índice
// >= ghostToStep ficam ghosted (o próprio step-alvo e os futuros).
export function buildNodes(
  statuses: DagStatuses,
  mode: 'kanban' | 'graph',
  ghostToStep: number | null,
): DagNode[] {
  return PIPELINE_ORDER.map((node, i) => {
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

// Arestas lineares na ordem do pipeline (entry→cpo→…→parallel_audit).
// Modo grafo: adiciona o loop retry→dev — detectado geometricamente (retry
// posicionado em GRAPH_POS.retry, abaixo do dev; no kanban retry fica na
// coluna linear, sem loop).
export function buildEdges(nodes: DagNode[]): DagEdge[] {
  const byId = new Map<string, DagNode>(nodes.map((n) => [n.id, n]))
  const edges: DagEdge[] = []
  for (let i = 0; i < PIPELINE_ORDER.length - 1; i++) {
    const source = PIPELINE_ORDER[i]
    const target = PIPELINE_ORDER[i + 1]
    if (byId.has(source) && byId.has(target)) {
      edges.push({ id: `${source}->${target}`, source, target })
    }
  }
  const retry = byId.get('retry')
  if (retry && retry.position.x === GRAPH_POS.retry.x && retry.position.y === GRAPH_POS.retry.y) {
    edges.push({ id: 'retry->dev', source: 'retry', target: 'dev' })
  }
  return edges
}
