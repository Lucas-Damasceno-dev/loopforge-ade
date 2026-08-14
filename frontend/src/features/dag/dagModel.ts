import type { NodeType, CostNode } from '../../shared/lib/types'
import type { NodeStatus } from '../../stores/canvasStore'

// ─── Modelo do DAG (puro/testável) ──────────────────────────────────────────
// O canvas NÃO guarda posições — a geometria vem daqui, derivada de
// canvasStore.nodeStatus + mode + ghostToStep (T5/T6). buildNodes/buildEdges
// são funções puras consumidas por FlowCanvas e pelos testes.

// Ordem canônica do pipeline (contrato 03 §7): nós de EXECUÇÃO + `entry`
// (virtual de apresentação — ponto de partida, sem node_execution). `retry`
// é virtual E condicional: entra no canvas apenas quando alguma tentativa
// (attemptCount) > 0 — não faz parte do backbone fixo. PIPELINE_ORDER é a
// ordem de EXECUÇÃO (consumida por RunInspector rows + TimelineBar ghost via
// execIndex); o sub-grafo display (split/appsec/devops/merge) NÃO entra aqui.
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

// Nós DISPLAY-ONLY (S4): o passo de EXECUÇÃO parallel_audit é expandido no
// canvas em split → appsec/devops (paralelo) → merge. Status/attemptCount
// sempre derivam do pai (parallel_audit).
export const DISPLAY_NODES: NodeType[] = ['split', 'appsec', 'devops', 'merge']

export const DISPLAY_PARENT: Record<'split' | 'appsec' | 'devops' | 'merge', NodeType> = {
  split: 'parallel_audit',
  appsec: 'parallel_audit',
  devops: 'parallel_audit',
  merge: 'parallel_audit',
}

// Ordem de DISPLAY (canvas/TimelineBar de inspeção): PIPELINE_ORDER com
// parallel_audit → split,appsec,devops,merge (retry entra antes de split
// quando visível — pipelineOrderWithRetry + expansão).
export const DISPLAY_ORDER: NodeType[] = PIPELINE_ORDER.flatMap((n) =>
  n === 'parallel_audit' ? DISPLAY_NODES : [n],
)

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
  split: 'Split',
  merge: 'Merge',
  appsec: 'AppSec',
  devops: 'DevOps',
}

// Posições do modo grafo (2D): fluxo principal em linha horizontal reta (y=120),
// `retry` abaixo de `developer` (y=280) — o loop retry→developer sobe com aresta
// curva. Sub-grafo paralelo (S4): split onde parallel_audit estava, appsec
// (topo) e devops (base) em paralelo, merge à direita. parallel_audit NÃO tem
// posição (display-only não existe em GRAPH_POS — fallback linear em buildNodes).
// Kanban usa colunas lineares alinhadas horizontalmente (x = index * 240, y = 120).
const GRAPH_POS: Partial<Record<NodeType, { x: number; y: number }>> = {
  entry: { x: 0, y: 120 },
  cpo: { x: 220, y: 120 },
  pm: { x: 440, y: 120 },
  tech_lead: { x: 660, y: 120 },
  test_writer: { x: 880, y: 120 },
  developer: { x: 1100, y: 120 },
  qa: { x: 1320, y: 120 },
  retry: { x: 1100, y: 280 },
  split: { x: 1540, y: 120 },
  appsec: { x: 1760, y: 60 },
  devops: { x: 1760, y: 180 },
  merge: { x: 1980, y: 120 },
}

// type (não interface): atribuição a Record<string, unknown> exige índice
// implícito — interfaces não têm (quebra o constraint NodeProps<Node> do xyflow).
export type DagNodeData = {
  node: NodeType
  status: NodeStatus
  attemptCount: number
  /** Índice de EXECUÇÃO (posição em PIPELINE_ORDER; retry incluso quando
   *  visível). Nós do sub-grafo display herdam o índice do pai
   *  (parallel_audit) — ghosting (execIndex >= ghostToStep) apaga o bloco
   *  inteiro junto com o passo de execução (semântica TimelineBar). */
  execIndex: number
  ghosted: boolean
  /** Flag do bloco paralelo (S4): 'audit' no nó split — SplitNode sabe que
   *  representa o passo parallel_audit (apresenta sub-cards appsec/devops). */
  display?: 'audit'
  /** Custo do nó (Fase D/UC-04) — injetado pelo FlowCanvas via cost query;
   *  o buildNodes puro não o conhece (cost é dado de servidor, não de store). */
  cost?: CostNode
}

export interface DagNode {
  id: NodeType
  /** Componente do canvas: split/merge têm nós próprios (T3); demais usam
   *  AgentNode (inclui appsec/devops — filhos reutilizam o AgentNode). */
  type: 'agent' | 'split' | 'merge'
  position: { x: number; y: number }
  data: DagNodeData
}

export interface DagEdge {
  id: string
  source: NodeType
  target: NodeType
  animated?: boolean
  style?: Record<string, unknown>
  /** Handles do sub-grafo (S4): SplitNode a=topo/b=base (source),
   *  MergeNode a=topo/b=base (target). */
  sourceHandle?: string
  targetHandle?: string
  /** Posições de ancoragem da aresta (S4 — retry do filho, curva custom). */
  sourcePosition?: 'top' | 'bottom' | 'left' | 'right'
  targetPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Aresta tracejada (S4 — retry de filho devops→split). */
  dashed?: boolean
}

export type DagStatuses = Partial<Record<NodeType, { status: NodeStatus; attemptCount: number }>>

// Ordem de display com retry (virtual) no backbone entre qa e split.
function displayOrderWithRetry(): NodeType[] {
  const idx = PIPELINE_ORDER.indexOf('parallel_audit')
  return [...PIPELINE_ORDER.slice(0, idx), RETRY_NODE, ...PIPELINE_ORDER.slice(idx)].flatMap((n) =>
    n === 'parallel_audit' ? DISPLAY_NODES : [n],
  )
}

// Ordem de EXECUÇÃO (PIPELINE_ORDER + retry quando visível) — base do execIndex.
function executionOrder(hasRetry: boolean): NodeType[] {
  if (!hasRetry) return PIPELINE_ORDER
  const idx = PIPELINE_ORDER.indexOf('parallel_audit')
  return [...PIPELINE_ORDER.slice(0, idx), RETRY_NODE, ...PIPELINE_ORDER.slice(idx)]
}

// Índice de execução: posição do próprio nó na ordem de execução; nós do
// sub-grafo display herdam o índice do pai (parallel_audit).
function execIndexOf(node: NodeType, hasRetry: boolean): number {
  const order = executionOrder(hasRetry)
  if (node in DISPLAY_PARENT) return order.indexOf('parallel_audit')
  return order.indexOf(node)
}

// Constrói os nós na ordem de display. Status default: pending/0 tentativas.
// `retry` (virtual) aparece apenas quando alguma tentativa > 0 (contrato 03
// §7) — entra no backbone entre qa e split. Nós display (split/appsec/devops/
// merge) derivam status/attemptCount/execIndex do pai parallel_audit (S4).
// Ghosting (UX5): ghostToStep numérico = índice do step de EXECUÇÃO — nós com
// execIndex >= ghostToStep ficam ghosted (o próprio step-alvo e os futuros;
// sub-grafo inteiro some junto com parallel_audit).
export function buildNodes(
  statuses: DagStatuses,
  mode: 'kanban' | 'graph',
  ghostToStep: number | null,
): DagNode[] {
  const hasRetry = Object.values(statuses).some((s) => s.attemptCount > 0)
  const order = hasRetry ? displayOrderWithRetry() : DISPLAY_ORDER
  return order.map((node, i) => {
    const displayNode = node in DISPLAY_PARENT
    const entry = statuses[displayNode ? 'parallel_audit' : node] ?? { status: 'pending' as NodeStatus, attemptCount: 0 }
    const position = mode === 'graph' ? (GRAPH_POS[node] ?? { x: i * 240, y: 120 }) : { x: i * 240, y: 120 }
    const execIndex = execIndexOf(node, hasRetry)
    return {
      id: node,
      type: node === 'split' ? 'split' : node === 'merge' ? 'merge' : 'agent',
      position,
      data: {
        node,
        status: entry.status,
        attemptCount: entry.attemptCount,
        execIndex,
        ghosted: ghostToStep !== null && execIndex >= ghostToStep,
        ...(displayNode && node === 'split' ? { display: 'audit' as const } : {}),
      },
    }
  })
}

// Arestas do display: backbone linear (entry→cpo→…→qa) + sub-grafo paralelo
// (qa→split; split→appsec/→devops com sourceHandle a/b; appsec/→devops→merge
// com targetHandle a/b). Filhos NÃO têm aresta entre si. Com retry visível:
// qa→retry→split. Modo grafo: adiciona o loop retry→developer — detectado
// geometricamente (retry posicionado em GRAPH_POS.retry, abaixo do developer;
// no kanban retry fica na coluna linear, sem loop) — e o retry de FILHO
// devops→split tracejado (positions bottom) quando o pai tem attemptCount > 0.
export function buildEdges(nodes: DagNode[]): DagEdge[] {
  const byId = new Map<string, DagNode>(nodes.map((n) => [n.id, n]))
  const edges: DagEdge[] = []
  const hasRetry = byId.has(RETRY_NODE)

  const push = (source: NodeType, target: NodeType, extra: Partial<DagEdge> = {}) => {
    if (!byId.has(source) || !byId.has(target)) return
    const isRunning = byId.get(target)!.data.status === 'running'
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      animated: isRunning,
      style: isRunning ? { stroke: 'var(--accent)', strokeWidth: 2 } : { stroke: 'var(--border)', strokeWidth: 1.5 },
      ...extra,
    })
  }

  // Backbone linear até qa (nós fixos — sempre presentes).
  for (let i = 0; i < PIPELINE_ORDER.length - 1; i++) {
    const source = PIPELINE_ORDER[i]
    const target = PIPELINE_ORDER[i + 1]
    if (source === 'parallel_audit') break // parallel_audit é expandido no display
    push(source, target)
  }
  // Entrada do sub-grafo: qa→split (retry visível: qa→retry→split).
  if (hasRetry) {
    push('qa', RETRY_NODE)
    push(RETRY_NODE, 'split')
  } else {
    push('qa', 'split')
  }
  // Fan-out paralelo: split→appsec (handle a) / split→devops (handle b).
  push('split', 'appsec', { sourceHandle: 'a' })
  push('split', 'devops', { sourceHandle: 'b' })
  // Fan-in: appsec→merge (handle a) / devops→merge (handle b).
  push('appsec', 'merge', { targetHandle: 'a' })
  push('devops', 'merge', { targetHandle: 'b' })

  // Loop retry→developer (modo grafo, detecção geométrica).
  const retry = byId.get(RETRY_NODE)
  if (retry && retry.position.x === GRAPH_POS.retry?.x && retry.position.y === GRAPH_POS.retry?.y) {
    const isRetryRunning = retry.data.status === 'running'
    edges.push({
      id: `${RETRY_NODE}->developer`,
      source: RETRY_NODE,
      target: 'developer',
      animated: true,
      style: isRetryRunning ? { stroke: 'var(--err)', strokeWidth: 2 } : { stroke: 'var(--accent)', strokeWidth: 1.5 },
    })
  }

  // Retry de FILHO (S4): devops→split tracejado — só modo grafo (devops na
  // posição GRAPH_POS) e quando o pai (parallel_audit) teve tentativas > 0.
  const devops = byId.get('devops')
  if (
    devops &&
    devops.position.x === GRAPH_POS.devops?.x &&
    devops.position.y === GRAPH_POS.devops?.y &&
    devops.data.attemptCount > 0
  ) {
    edges.push({
      id: 'retry-devops->split',
      source: 'devops',
      target: 'split',
      dashed: true,
      animated: true,
      style: { stroke: 'var(--err)', strokeWidth: 1.5, strokeDasharray: '6 4' },
      sourcePosition: 'bottom',
      targetPosition: 'bottom',
    })
  }
  return edges
}
