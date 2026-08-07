import { memo } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import type { NodeType } from '../../shared/lib/types'
import type { NodeStatus } from '../../stores/canvasStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { Badge } from '../../shared/ui/Badge'
import { NODE_LABELS, type DagNodeData } from './dagModel'

// v12: NodeProps é genérico sobre um NODE. Usamos Node<DagNodeData,'agent'>
// (id: string) — o tipo do componente; o DagNode do model (id: NodeType) é o
// que o FlowCanvas alimenta em runtime.

// status → tone do Badge (zinc/azul/verde/vermelho/âmbar).
const STATUS_TONE: Record<NodeStatus, 'neutral' | 'accent' | 'ok' | 'err' | 'warn'> = {
  pending: 'neutral',
  running: 'accent',
  approved: 'ok',
  rejected: 'err',
  paused: 'warn',
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  approved: 'Approved',
  rejected: 'Rejected',
  paused: 'Paused',
}

// Vars de acento por tipo usam kebab-case: --node-tech-lead (NodeType usa _).
function nodeAccentVar(node: NodeType): string {
  return `var(--node-${node.replaceAll('_', '-')})`
}

function AgentNodeInner({ data, selected }: NodeProps<FlowNode<DagNodeData, 'agent'>>) {
  const { node, status, attemptCount, ghosted } = data
  const accent = nodeAccentVar(node)
  const label = NODE_LABELS[node]
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label} (${STATUS_LABEL[status]})`}
      onClick={() => useCanvasStore.getState().selectNode(node)}
      onKeyDown={(e) => {
        // a11y: Enter ou Espaço → mesmo comportamento do clique (seleção).
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          useCanvasStore.getState().selectNode(node)
        }
      }}
      className={[
        'w-44 cursor-pointer rounded-xl border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 shadow-md outline-none',
        'transition-opacity focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        ghosted ? 'opacity-40' : '',
        selected ? 'ring-2 ring-[var(--accent)]' : '',
      ].join(' ')}
      style={{ borderTopColor: accent }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border)' }} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: accent }}>{label}</span>
        {attemptCount > 1 && (
          <span
            title={`retry ×${attemptCount}`}
            className="rounded bg-[var(--err)]/15 px-1 text-xs font-bold text-[var(--err)]"
          >
            ×{attemptCount}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{status}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)' }} />
    </div>
  )
}

export const AgentNode = memo(AgentNodeInner)
