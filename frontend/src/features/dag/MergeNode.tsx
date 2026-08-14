import { memo } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../../stores/canvasStore'
import { Badge } from '../../shared/ui/Badge'
import type { DagNodeData } from './dagModel'
import { nodeAccentTextVar, nodeAccentVar } from './nodeAccent'
import { NODE_STATUS_LABEL, NODE_STATUS_TONE } from './nodeStatusMeta'

// MergeNode (S4): convergência do bloco paralelo — recebe appsec (handle a)
// e devops (handle b) e fecha o passo parallel_audit. Clique abre o inspector
// do PAI (parallel_audit).
function MergeNodeInner({ data, selected }: NodeProps<FlowNode<DagNodeData, 'merge'>>) {
  const { status, ghosted } = data
  const accent = nodeAccentVar('merge')
  const accentText = nodeAccentTextVar('merge')

  const select = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Ghosts (timeline) não abrem o inspect drawer (01b §3.1).
    if (ghosted) return
    // Impede o onNodeClick do FlowCanvas (selectNode(node.id) = 'merge') de
    // sobrescrever — aqui o alvo é o nó REAL de execução (parallel_audit).
    e.stopPropagation()
    useCanvasStore.getState().selectNode('parallel_audit')
  }

  return (
    <button
      type="button"
      tabIndex={ghosted ? -1 : 0}
      aria-disabled={ghosted || undefined}
      aria-label={`Merge (parallel audit, ${NODE_STATUS_LABEL[status]})`}
      onClick={select}
      className={[
        'w-32 cursor-pointer rounded-[var(--radius-md)] border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 outline-none',
        status === 'running' && !ghosted ? 'shadow-[var(--glow-accent)] ade-node-running' : 'ade-fade-in shadow-[var(--shadow-node)] hover:shadow-md hover:-translate-y-0.5',
        'transition-all duration-[var(--dur-base)] ease-out',
        'hover:border-[var(--border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        ghosted ? 'pointer-events-none opacity-40' : '',
        selected ? 'ring-2 ring-[var(--accent)]' : '',
      ].join(' ')}
      style={{ borderTopColor: ghosted ? 'transparent' : accent }}
    >
      {/* Handles do fan-in: a=topo (appsec), b=base (devops). */}
      <Handle id="a" type="target" position={Position.Left} style={{ top: '30%', background: 'var(--border)' }} />
      <Handle id="b" type="target" position={Position.Left} style={{ top: '70%', background: 'var(--border)' }} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: accentText }}>Merge</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Badge tone={NODE_STATUS_TONE[status]}>{NODE_STATUS_LABEL[status]}</Badge>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)' }} />
    </button>
  )
}

export const MergeNode = memo(MergeNodeInner)
