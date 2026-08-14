import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type OnNodesChange,
} from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { getRunCost } from '../../shared/lib/api'
import { isDemoRunId } from '../runs/demoMock'
import { normalizeNodeName } from '../../shared/lib/ws'
import type { CostNode, CostResponse, NodeType } from '../../shared/lib/types'
import { useEditorStore } from '../pipelines/editorStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { NodePalette } from '../pipelines/NodePalette'
import { EdgeConfigDrawer } from '../pipelines/EdgeConfigDrawer'
import { pipelineToNodes, pipelineToEdges, type EditorNode, type EditorEdge } from '../pipelines/editorModel'
import { AgentNode } from './AgentNode'
import { SplitNode } from './SplitNode'
import { MergeNode } from './MergeNode'
import { buildNodes, buildEdges, DISPLAY_PARENT, type DagNode, type DagEdge } from './dagModel'

// nodeTypes estável fora do componente (React Flow recria se mudar a cada render).
const nodeTypes = { agent: AgentNode, split: SplitNode, merge: MergeNode }

// Enriquecimento puro das edges p/ o React Flow (separado p/ teste — edges NÃO
// renderizam no jsdom; a lógica precisa ser unit-testável).
// - markerEnd: err quando dashed (retry filho devops->split), accent quando
//   animada (loop retry->developer), border nos demais.
// - sourcePosition/targetPosition (bottom no retry filho) já fluem via spread.
export function decorateEdges(edges: DagEdge[]) {
  return edges.map((e) => ({
    ...e,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.dashed ? 'var(--err)' : e.animated ? 'var(--accent)' : 'var(--border)',
    },
    animated: e.animated,
    style: e.style ?? (e.animated ? { stroke: 'var(--accent)', strokeWidth: 2 } : { stroke: 'var(--border)', strokeWidth: 1.5 }),
  }))
}

export interface FlowCanvasProps {
  onNodeClick?: (id: string) => void
}

// Canvas do DAG: kanban linear ou grafo 2D. NÃO guarda estado de status —
// renderiza puramente de canvasStore (nodeStatus/mode/ghostToStep) re-derivando
// via buildNodes/buildEdges (T5/T6).
//
// Fase D (UC-04): o custo por nó (CostResponse.nodes) é consumido com a MESMA
// queryKey ['run-cost', runId] do CostBar — TanStack Query deduplica, sem fetch
// duplicado. O custo é injetado no data do nó (DagNodeData.cost) e o AgentNode
// renderiza o chip (~$0.12 quando estimated).
//
// P0.9: auto-fit (fitView) quando o layout carrega (0 nós → N) ou quando a run
// ativa troca — evita nós cortados (Retry/Parallel Audit). Depois disso o
// pan/zoom fica manual; o fit só dispara nas transições acima.
export function FlowCanvas({ onNodeClick }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasContent onNodeClick={onNodeClick} />
    </ReactFlowProvider>
  )
}

// Conteúdo interno sob o ReactFlowProvider — necessário para usar useReactFlow
// (a instância do React Flow só existe dentro do provider).
function CanvasContent({ onNodeClick }: FlowCanvasProps) {
  const mode = useCanvasStore(useShallow((s) => s.mode))
  const nodeStatus = useCanvasStore(useShallow((s) => s.nodeStatus))
  const ghostToStep = useCanvasStore(useShallow((s) => s.ghostToStep))
  const selectedNodeId = useCanvasStore(useShallow((s) => s.selectedNodeId))
  const selectNode = useCanvasStore((s) => s.selectNode)

  // ─── Modo edição (S3) ────────────────────────────────────────────────────
  // editorOpen && !live → renderiza o DRAFT do pipeline (editorModel) com
  // drag/connect/delete + paleta + edge config. live=true → DAG de execução
  // atual (buildNodes/buildEdges), comportamento 1:1 (sem paleta/drag).
  const editorOpen = useEditorStore((s) => s.open)
  const editorLive = useEditorStore((s) => s.live)
  const draft = useEditorStore((s) => s.draft)
  const positions = useEditorStore((s) => s.positions)
  const addEdge = useEditorStore((s) => s.addEdge)
  const removeNode = useEditorStore((s) => s.removeNode)
  const removeEdge = useEditorStore((s) => s.removeEdge)
  const setSelectedEdgeId = useEditorStore((s) => s.setSelectedEdgeId)
  const setPosition = useEditorStore((s) => s.setPosition)
  const editMode = editorOpen && !editorLive

  // F1 (fix round 1): label do nó agent no modo edição = nome do agente da
  // biblioteca (agentsStore). Mapa id→name injetado no pipelineToNodes.
  // F1 (fix wave): useMemo — o mapa NÃO é recriado a cada render; o effect
  // abaixo depende dele e re-roda quando agents chega do fetch (race: labels
  // genéricos 'Agent' até o store popular).
  const agents = useAgentsStore((s) => s.agents)
  const agentNameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents])

  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const run = runs.find((r) => r.id === activeRunId) ?? null

  // Mesma key do CostBar (dedupe) — mesma condição de enable (sem custo p/
  // run ausente/queued/paused). Run demo-* é sintética (sem registro no
  // backend) — GET /cost daria 404; sem fetch, o nó renderiza sem chip.
  const { data: cost } = useQuery<CostResponse>({
    queryKey: ['run-cost', activeRunId],
    queryFn: () => getRunCost(activeRunId as string),
    enabled: !!activeRunId && !isDemoRunId(activeRunId) && run !== null && run.status !== 'queued' && run.status !== 'paused',
    // Polling só enquanto a run está viva: o custo por nó cresce em tempo real;
    // concluída/falha, os dados já estão no cache (mesmo padrão do InspectDrawer).
    refetchInterval: run !== null && run.status === 'running' ? 5000 : false,
  })

  const [showMinimap, setShowMinimap] = useState(false)

  // Estado do canvas: nós/edges do DAG live (DagNode/DagEdge) OU do editor de
  // pipelines (EditorNode/EditorEdge — ids de pipeline são strings livres).
  const [nodes, setNodes, onNodesChange] = useNodesState<DagNode | EditorNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<DagEdge | EditorEdge>([])
  const { fitView } = useReactFlow()

  // P0.9: fit na transição vazio → layout (primeiro carregamento) e na troca
  // de run ativa. hadNodes/prevRunId refs distinguem essas transições do
  // crescimento normal (cada nó completado re-deriva nodes — sem re-fit).
  const prevRunId = useRef<string | null>(null)
  const hadNodes = useRef(false)
  useEffect(() => {
    if (nodes.length === 0) {
      hadNodes.current = false
      return
    }
    const runChanged = prevRunId.current !== activeRunId
    if (!hadNodes.current || runChanged) {
      void fitView({ padding: 0.25, duration: 350 })
    }
    prevRunId.current = activeRunId
    hadNodes.current = true
  }, [nodes.length, activeRunId, fitView])

  // Re-deriva a geometria + status quando o canvasStore muda (WS → stores → aqui).
  useEffect(() => {
    // Modo edição: renderiza o DRAFT do pipeline (sem custo/status — dados de
    // execução não existem p/ um pipeline não-rodado).
    if (editMode) {
      if (!draft) return
      setNodes(pipelineToNodes(draft, positions, agentNameById).map((n) => ({ ...n, selected: false })))
      setEdges(pipelineToEdges(draft))
      return
    }
    // Custo por nó: mapa {NodeType → CostNode} — nome do backend normalizado
    // (developer/qa/…) para o id canônico do canvas (dev → developer alias).
    const costByNode = new Map<string, CostNode>()
    for (const entry of cost?.nodes ?? []) {
      const node = normalizeNodeName(entry.node)
      if (node) costByNode.set(node, entry)
    }
    // S4: o split (display) herda o custo do PAI de execução (parallel_audit)
    // — o único display node com custo nesta fase; appsec/devops/merge sem chip.
    const auditCost = costByNode.get('parallel_audit')
    if (auditCost) costByNode.set('split', auditCost)
    const dagNodes = buildNodes(nodeStatus, mode, ghostToStep)
    setNodes(
      dagNodes.map((n) => ({
        ...n,
        data: { ...n.data, cost: costByNode.get(n.id) },
        // F1 (final review): selectedNodeId sempre é o nó REAL (parallel_audit
        // mapeado no clique) — display nodes casam via DISPLAY_PARENT, senão o
        // ring-2 de seleção nunca aparecia no bloco audit.
        selected: selectedNodeId === n.id || DISPLAY_PARENT[n.id] === selectedNodeId,
      })),
    )
    setEdges(decorateEdges(buildEdges(dagNodes)))
  }, [editMode, draft, positions, mode, nodeStatus, ghostToStep, selectedNodeId, cost, agentNameById, setNodes, setEdges])

  // F3 (fix wave): editor abre herdando zoom/pan da run anterior (hadNodes já
  // true → o effect de fit acima não dispara). Fit explícito no draft do
  // editor, após os nós montarem (setNodes do React Flow é assíncrono).
  useEffect(() => {
    if (!editMode || !draft) return
    const t = setTimeout(() => void fitView({ padding: 0.25, duration: 350 }), 50)
    return () => clearTimeout(t)
  }, [editMode, draft, fitView])

  // Drag no modo edição → positions no editorStore (draft não persiste geometria).
  const onEditNodesChange: OnNodesChange = (changes) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) setPosition(c.id, c.position)
    }
  }

  const handleEditConnect = (conn: { source: string | null; target: string | null }) => {
    if (conn.source && conn.target) addEdge(conn.source, conn.target)
  }

  return (
    <div className="h-full w-full" style={{ background: 'var(--bg)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={editMode ? onEditNodesChange : onNodesChange}
        onEdgesChange={editMode ? () => {} : onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={editMode}
        nodesConnectable={editMode}
        deleteKeyCode={editMode ? 'Backspace' : null}
        onConnect={editMode ? handleEditConnect : undefined}
        onEdgeClick={editMode ? (_, edge) => setSelectedEdgeId(edge.id) : undefined}
        onNodesDelete={(deleted) => deleted.forEach((n) => removeNode(n.id))}
        onEdgesDelete={(deleted) => deleted.forEach((e) => removeEdge(e.id))}
        proOptions={{ hideAttribution: true }}
        // Arestas: --border 1.5px + seta discreta (01b §6.3); a aresta
        // retry→dev segue animada (loop vivo).
        defaultEdgeOptions={{ style: { stroke: 'var(--border)', strokeWidth: 1.5 } }}
        onNodeClick={(_, node) => {
          // Modo edição: sem inspector (clique gerencia seleção/drag do editor).
          if (editMode) return
          // S4: filhos display (appsec/devops) abrem o inspector do PAI
          // (parallel_audit) — o onClick do próprio nó também mapeia, mas o
          // React Flow dispara este handler por último (bubble) e sobrescreveria
          // com node.id; mapear aqui garante o contrato no fluxo integrado.
          selectNode(DISPLAY_PARENT[node.id as NodeType] ?? node.id)
          onNodeClick?.(node.id)
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls className="!bg-[var(--bg-elev)] !border-[var(--border)] !shadow-sm [&>button]:!bg-[var(--bg-elev)] [&>button]:!border-[var(--border)] [&>button]:!text-[var(--text-dim)] hover:[&>button]:!text-[var(--text)]" />
        {editMode && <NodePalette />}
        {editMode && <EdgeConfigDrawer />}
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            nodeColor="var(--accent)"
            maskColor="var(--overlay-strong)"
            bgColor="var(--bg-elev)"
            className="!border !border-[var(--border)] !rounded-lg !shadow-lg backdrop-blur-md overflow-hidden"
          />
        )}
        <div className="absolute bottom-3 right-3 z-10">
          <button
            type="button"
            onClick={() => setShowMinimap((v) => !v)}
            title={showMinimap ? 'Hide Minimap' : 'Show Minimap'}
            aria-label={showMinimap ? 'Hide Minimap' : 'Show Minimap'}
            className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)]/90 px-2 py-1 text-(--text-2xs) font-medium text-[var(--text-dim)] shadow-xs backdrop-blur-sm transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)]"
          >
            <span aria-hidden="true" className="font-mono text-xs font-bold leading-none">M</span>
            {showMinimap ? 'Hide Map' : 'Minimap'}
          </button>
        </div>
      </ReactFlow>
    </div>
  )
}
