import { useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '../../stores/canvasStore'
import { AgentNode } from './AgentNode'
import { buildNodes, buildEdges, type DagNode, type DagEdge } from './dagModel'

// nodeTypes estável fora do componente (React Flow recria se mudar a cada render).
const nodeTypes = { agent: AgentNode }

export interface FlowCanvasProps {
  onNodeClick?: (id: string) => void
}

// Canvas do DAG: kanban linear ou grafo 2D. NÃO guarda estado de status —
// renderiza puramente de canvasStore (nodeStatus/mode/ghostToStep) re-derivando
// via buildNodes/buildEdges (T5/T6).
export function FlowCanvas({ onNodeClick }: FlowCanvasProps) {
  const mode = useCanvasStore(useShallow((s) => s.mode))
  const nodeStatus = useCanvasStore(useShallow((s) => s.nodeStatus))
  const ghostToStep = useCanvasStore(useShallow((s) => s.ghostToStep))
  const selectedNodeId = useCanvasStore(useShallow((s) => s.selectedNodeId))
  const selectNode = useCanvasStore((s) => s.selectNode)

  const [nodes, setNodes, onNodesChange] = useNodesState<DagNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<DagEdge>([])

  // Re-deriva a geometria + status quando o canvasStore muda (WS → stores → aqui).
  useEffect(() => {
    const dagNodes = buildNodes(nodeStatus, mode, ghostToStep)
    setNodes(dagNodes.map((n) => ({ ...n, selected: selectedNodeId === n.id })))
    setEdges(
      buildEdges(dagNodes).map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: e.id === 'retry->dev',
      })),
    )
  }, [mode, nodeStatus, ghostToStep, selectedNodeId, setNodes, setEdges])

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
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => {
          selectNode(node.id)
          onNodeClick?.(node.id)
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}
