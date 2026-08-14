import { memo } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../../stores/canvasStore'
import { Badge } from '../../shared/ui/Badge'
import type { DagNodeData } from './dagModel'
import { nodeAccentTextVar, nodeAccentVar } from './nodeAccent'
import { NODE_STATUS_LABEL, NODE_STATUS_TONE } from './nodeStatusMeta'

// SplitNode (S4): gateway do bloco paralelo — representa o passo de EXECUÇÃO
// parallel_audit (data.display='audit'). Compacto (w-32), badge "2× parallel"
// (pulsa quando running — mockup item 7), 2 source handles (a=topo → appsec,
// b=base → devops). Clique abre o inspector do PAI (parallel_audit) — o
// InspectDrawer é keyed no nó real de execução.
function SplitNodeInner({ data, selected }: NodeProps<FlowNode<DagNodeData, 'split'>>) {
  const { status, ghosted } = data
  const accent = nodeAccentVar('split')
  const accentText = nodeAccentTextVar('split')

  const select = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Ghosts (timeline) não abrem o inspect drawer (01b §3.1).
    if (ghosted) return
    // Impede o onNodeClick do FlowCanvas (selectNode(node.id) = 'split') de
    // sobrescrever — aqui o alvo é o nó REAL de execução (parallel_audit).
    e.stopPropagation()
    useCanvasStore.getState().selectNode('parallel_audit')
  }

  return (
    <button
      type="button"
      tabIndex={ghosted ? -1 : 0}
      aria-disabled={ghosted || undefined}
      aria-label="Split (parallel audit)"
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
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border)' }} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: accentText }}>Split</span>
        {/* Badge "2× parallel" (mockup item 7): pulsa enquanto o bloco roda. */}
        <span
          title="Runs branches in parallel"
          className={[
            'rounded bg-[var(--accent)]/15 px-1 font-mono text-(--text-2xs) font-bold text-[var(--accent-text)]',
            status === 'running' && !ghosted ? 'animate-pulse' : '',
          ].join(' ')}
        >
          2× parallel
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Badge tone={NODE_STATUS_TONE[status]}>{NODE_STATUS_LABEL[status]}</Badge>
      </div>
      {/* Handles do fan-out: a=topo (appsec, y=60), b=base (devops, y=180). */}
      <Handle id="a" type="source" position={Position.Right} style={{ top: '30%', background: 'var(--border)' }} />
      <Handle id="b" type="source" position={Position.Right} style={{ top: '70%', background: 'var(--border)' }} />
    </button>
  )
}

export const SplitNode = memo(SplitNodeInner)
