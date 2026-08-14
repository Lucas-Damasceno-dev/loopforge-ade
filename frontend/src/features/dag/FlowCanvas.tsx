import { useEffect, useRef, useState } from 'react'
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
} from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { getRunCost } from '../../shared/lib/api'
import { isDemoRunId } from '../runs/demoMock'
import { normalizeNodeName } from '../../shared/lib/ws'
import type { CostNode, CostResponse } from '../../shared/lib/types'
import { AgentNode } from './AgentNode'
import { SplitNode } from './SplitNode'
import { MergeNode } from './MergeNode'
import { buildNodes, buildEdges, type DagNode, type DagEdge } from './dagModel'

// nodeTypes estável fora do componente (React Flow recria se mudar a cada render).
const nodeTypes = { agent: AgentNode, split: SplitNode, merge: MergeNode }

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

  const [nodes, setNodes, onNodesChange] = useNodesState<DagNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<DagEdge>([])
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
    // Custo por nó: mapa {NodeType → CostNode} — nome do backend normalizado
    // (developer/qa/…) para o id canônico do canvas (dev → developer alias).
    const costByNode = new Map<string, CostNode>()
    for (const entry of cost?.nodes ?? []) {
      const node = normalizeNodeName(entry.node)
      if (node) costByNode.set(node, entry)
    }
    const dagNodes = buildNodes(nodeStatus, mode, ghostToStep)
    setNodes(
      dagNodes.map((n) => ({
        ...n,
        data: { ...n.data, cost: costByNode.get(n.id) },
        selected: selectedNodeId === n.id,
      })),
    )
    setEdges(
      buildEdges(dagNodes).map((e) => ({
        ...e,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.animated ? 'var(--accent)' : 'var(--border)',
        },
        animated: e.animated,
        style: e.style ?? (e.animated ? { stroke: 'var(--accent)', strokeWidth: 2 } : { stroke: 'var(--border)', strokeWidth: 1.5 }),
      })),
    )
  }, [mode, nodeStatus, ghostToStep, selectedNodeId, cost, setNodes, setEdges])

  return (
    <div className="h-full w-full" style={{ background: 'var(--bg)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        // Arestas: --border 1.5px + seta discreta (01b §6.3); a aresta
        // retry→dev segue animada (loop vivo).
        defaultEdgeOptions={{ style: { stroke: 'var(--border)', strokeWidth: 1.5 } }}
        onNodeClick={(_, node) => {
          selectNode(node.id)
          onNodeClick?.(node.id)
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls className="!bg-[var(--bg-elev)] !border-[var(--border)] !shadow-sm [&>button]:!bg-[var(--bg-elev)] [&>button]:!border-[var(--border)] [&>button]:!text-[var(--text-dim)] hover:[&>button]:!text-[var(--text)]" />
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
