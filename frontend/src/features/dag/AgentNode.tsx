import { memo, useEffect, useState } from 'react'
import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../../stores/canvasStore'
import { useConsoleStore } from '../../stores/consoleStore'
import { Badge } from '../../shared/ui/Badge'
import { Icon, type IconName } from '../../shared/ui/icons'
import { formatUsd } from '../costs/costModel'
import { NODE_LABELS, DISPLAY_PARENT, type DagNodeData } from './dagModel'
import { nodeAccentTextVar, nodeAccentVar } from './nodeAccent'
import { NODE_STATUS_LABEL, NODE_STATUS_TONE } from './nodeStatusMeta'

const PERSONA_ICON_NAMES: Record<string, IconName> = {
  cpo: 'node_cpo',
  pm: 'node_pm',
  tech_lead: 'node_tech_lead',
  test_writer: 'node_test_writer',
  developer: 'node_developer',
  dev: 'node_developer',
  qa: 'node_qa',
  appsec: 'node_appsec',
  devops: 'node_devops',
  parallel_audit: 'node_parallel_audit',
  retry: 'node_retry',
  input: 'node_input',
  output: 'node_output',
  gate: 'node_gate',
}

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
  // S3 (editor): data.label override — agente da biblioteca com nome próprio;
  // fallback p/ NODE_LABELS (nós do DAG live e input/output/gate do editor).
  const label = data.label ?? NODE_LABELS[node]
  const elapsed = useRunningTimer(status === 'running' && !ghosted)

  const select = () => {
    // Nós do editor de pipeline (data.selectable=false) não abrem o inspect
    // drawer — clique gerencia seleção/drag do editor (S3 T11, fix visual).
    if ((data as { selectable?: boolean }).selectable === false) return
    // Ghosts (timeline) não abrem o inspect drawer (01b §3.1).
    if (ghosted) return
    // S4: filhos display (appsec/devops) abrem o inspector do PAI de execução
    // (parallel_audit) — o InspectDrawer é keyed no nó real; nós normais
    // selecionam a si mesmos (inalterado).
    useCanvasStore.getState().selectNode(DISPLAY_PARENT[node] ?? node)
  }

  // Glow no estado running (01b §4): sombra accent suave substitui a shadow
  // padrão do nó — sombra estática (sem pulse p/ não piscar o texto do nó).
  const isStreaming = useConsoleStore((s) => Boolean(s.streams[node]))
  const glow = (status === 'running' || isStreaming) && !ghosted

  const iconName: IconName = PERSONA_ICON_NAMES[node] ?? 'agents'

  return (
    <button
      type="button"
      tabIndex={ghosted ? -1 : 0}
      aria-disabled={ghosted || undefined}
      aria-label={`${label} (${isStreaming ? 'streaming' : NODE_STATUS_LABEL[status]})`}
      onClick={select}
      className={[
        'relative w-44 cursor-pointer overflow-hidden rounded-[var(--radius-md)] border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 outline-none',
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
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0" style={{ color: accentText }}>
            <Icon name={iconName} className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-semibold" style={{ color: accentText }}>{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {glow && <span className="ade-live-dot mr-0.5" />}
          {attemptCount > 1 && (
            <span
              title={`retry ×${attemptCount}`}
              className="rounded bg-[var(--err)]/15 px-1 text-xs font-bold text-[var(--err-text)]"
            >
              ×{attemptCount}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge tone={isStreaming ? 'info' : NODE_STATUS_TONE[status]}>
            {isStreaming ? 'streaming' : NODE_STATUS_LABEL[status]}
          </Badge>
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
      {glow && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[var(--bg-elev-2)]">
          <div className="ade-shimmer-bar h-full" style={{ backgroundColor: accent }} />
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)' }} />
    </button>
  )
}

export const AgentNode = memo(AgentNodeInner)
