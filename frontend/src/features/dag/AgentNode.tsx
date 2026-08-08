import { memo } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import type { NodeStatus } from '../../stores/canvasStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { Badge } from '../../shared/ui/Badge'
import { formatUsd } from '../costs/costModel'
import { NODE_LABELS, type DagNodeData } from './dagModel'
import { nodeAccentTextVar, nodeAccentVar } from './nodeAccent'

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

function AgentNodeInner({ data, selected }: NodeProps<FlowNode<DagNodeData, 'agent'>>) {
  const { node, status, attemptCount, ghosted } = data
  const accent = nodeAccentVar(node)
  const accentText = nodeAccentTextVar(node)
  const label = NODE_LABELS[node]

  const select = () => {
    // Ghosts (timeline) não abrem o inspect drawer (01b §3.1).
    if (ghosted) return
    useCanvasStore.getState().selectNode(node)
  }

  return (
    <div
      role="button"
      tabIndex={ghosted ? -1 : 0}
      aria-disabled={ghosted || undefined}
      aria-label={`${label} (${STATUS_LABEL[status]})`}
      onClick={select}
      onKeyDown={(e) => {
        // a11y: Enter ou Espaço → mesmo comportamento do clique (seleção).
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select()
        }
      }}
      className={[
        'w-44 cursor-pointer rounded-xl border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 shadow-[var(--shadow-node)] outline-none',
        'transition-[opacity,border-color,box-shadow,color] duration-150 ease-out',
        'hover:border-[#52525b] focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        ghosted ? 'pointer-events-none opacity-40' : '',
        selected ? 'ring-2 ring-[var(--accent)]' : '',
      ].join(' ')}
      style={{ borderTopColor: ghosted ? 'transparent' : accent }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border)' }} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: accentText }}>{label}</span>
        {attemptCount > 1 && (
          <span
            title={`retry ×${attemptCount}`}
            className="rounded bg-[var(--err)]/15 px-1 text-xs font-bold text-[var(--err-text)]"
          >
            ×{attemptCount}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <span className="flex min-w-0 items-center gap-1.5">
          {/* Chip de custo por nó (Fase D/UC-04): discreto (text-dim + border),
              ausente quando o nó não tem custo (nunca mostra $0.00). O `~`
              indica custo ESTIMADO (sem chave OpenRouter) — tooltip explica. */}
          {data.cost && data.cost.spent_usd > 0 && (
            <span
              data-testid={`cost-chip-${node}`}
              title={data.cost.estimated ? 'Estimated cost — no OpenRouter key, rough approximation' : 'Cost accrued by this node'}
              className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-px font-mono text-[10px] text-[var(--text-dim)]"
            >
              {data.cost.estimated ? '~' : ''}
              {formatUsd(data.cost.spent_usd)}
            </span>
          )}
          <span className="truncate text-[10px] font-medium lowercase tracking-wide text-[var(--text-dim)]">{status}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)' }} />
    </div>
  )
}

export const AgentNode = memo(AgentNodeInner)
