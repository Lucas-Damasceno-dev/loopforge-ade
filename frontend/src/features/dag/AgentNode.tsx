import { memo, useEffect, useState } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../../stores/canvasStore'
import { Badge } from '../../shared/ui/Badge'
import { formatUsd } from '../costs/costModel'
import { NODE_LABELS, type DagNodeData } from './dagModel'
import { nodeAccentTextVar, nodeAccentVar } from './nodeAccent'
import { NODE_STATUS_LABEL, NODE_STATUS_TONE } from './nodeStatusMeta'

function useRunningTimer(isRunning: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!isRunning) {
      setSeconds(0)
      return
    }
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isRunning])
  return seconds
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s < 10 ? '0' : ''}${s}s`
}

function AgentNodeInner({ data, selected }: NodeProps<FlowNode<DagNodeData, 'agent'>>) {
  const { node, status, attemptCount, ghosted } = data
  const accent = nodeAccentVar(node)
  const accentText = nodeAccentTextVar(node)
  const label = NODE_LABELS[node]
  const elapsed = useRunningTimer(status === 'running' && !ghosted)

  const select = () => {
    // Ghosts (timeline) não abrem o inspect drawer (01b §3.1).
    if (ghosted) return
    useCanvasStore.getState().selectNode(node)
  }

  // Glow no estado running (01b §4): sombra accent suave substitui a shadow
  // padrão do nó — sombra estática (sem pulse p/ não piscar o texto do nó).
  const glow = status === 'running' && !ghosted

  return (
    <button
      type="button"
      tabIndex={ghosted ? -1 : 0}
      aria-disabled={ghosted || undefined}
      aria-label={`${label} (${NODE_STATUS_LABEL[status]})`}
      onClick={select}
      className={[
        'w-44 cursor-pointer rounded-[var(--radius-md)] border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 outline-none',
        glow ? 'shadow-[var(--glow-accent)] ade-node-running' : 'ade-fade-in shadow-[var(--shadow-node)] hover:shadow-md hover:-translate-y-0.5',
        'transition-all duration-[var(--dur-base)] ease-out',
        'hover:border-[var(--border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
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
        <div className="flex items-center gap-1.5">
          <Badge tone={NODE_STATUS_TONE[status]}>{NODE_STATUS_LABEL[status]}</Badge>
          {status === 'running' && !ghosted && elapsed > 0 && (
            <span className="font-mono text-(--text-2xs) font-semibold text-[var(--accent-text)] animate-pulse">
              {formatDuration(elapsed)}
            </span>
          )}
        </div>
        <span className="flex min-w-0 items-center gap-1.5">
          {/* Chip de custo por nó (Fase D/UC-04): discreto (text-dim + border),
              ausente quando o nó não tem custo (nunca mostra $0.00). O `~`
              indica custo ESTIMADO (sem chave OpenRouter) — tooltip explica. */}
          {data.cost && data.cost.spent_usd > 0 && (
            <span
              data-testid={`cost-chip-${node}`}
              title={data.cost.estimated ? 'Estimated cost — no OpenRouter key, rough approximation' : 'Cost accrued by this node'}
              className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-px font-mono text-(--text-2xs) text-[var(--text-dim)]"
            >
              {data.cost.estimated ? '~' : ''}
              {formatUsd(data.cost.spent_usd)}
            </span>
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)' }} />
    </button>
  )
}

export const AgentNode = memo(AgentNodeInner)
