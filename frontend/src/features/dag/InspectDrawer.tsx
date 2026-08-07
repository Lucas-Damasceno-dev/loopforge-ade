import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatus, NodeStatusEntry } from '../../stores/canvasStore'
import { useConsoleStore } from '../../stores/consoleStore'
import { Drawer } from '../../shared/ui/Drawer'
import { Badge } from '../../shared/ui/Badge'
import { NODE_LABELS } from './dagModel'

// Mapeamentos duplicados do AgentNode (não exportados lá) — mesma semântica
// de cor/rótulo para status do nó.
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

const DEFAULT_ENTRY: NodeStatusEntry = { status: 'pending', attemptCount: 0 }

// Drawer de inspeção (UX8): abre com um nó selecionado no canvas
// (canvasStore.selectedNodeId). V1: payload/tokens ainda não existem no
// backend — placeholders; os LOGS são reais (consoleStore filtrado por nó).
export function InspectDrawer() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  const selectNode = useCanvasStore((s) => s.selectNode)
  const entries = useConsoleStore((s) => s.entries)

  const open = selectedNodeId !== null
  const node = selectedNodeId as NonNullable<typeof selectedNodeId> | null
  const label = node ? NODE_LABELS[node as keyof typeof NODE_LABELS] ?? node : ''
  const entry = (node ? nodeStatus[node as keyof typeof nodeStatus] : undefined) ?? DEFAULT_ENTRY

  // Logs do passo: entradas reais do console, escopadas ao nó selecionado.
  const nodeLogs = node ? entries.filter((e) => e.node === node) : []

  return (
    <Drawer open={open} title={label} onClose={() => selectNode(null)}>
      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
        {entry.attemptCount > 1 && (
          <span
            title={`retry ×${entry.attemptCount}`}
            className="rounded bg-[var(--err)]/15 px-1 text-xs font-bold text-[var(--err)]"
          >
            ×{entry.attemptCount}
          </span>
        )}
      </div>

      <section className="mb-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Inputs / Outputs</h3>
        <p className="text-sm text-[var(--text-dim)]">No payload recorded (V1)</p>
      </section>

      <section className="mb-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Tokens / Context</h3>
        <p className="text-sm text-[var(--text-dim)]">—</p>
      </section>

      <section className="mb-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Step logs</h3>
        {nodeLogs.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">No logs for this node</p>
        ) : (
          <ul className="space-y-0.5 font-mono text-xs leading-5">
            {nodeLogs.map((e) => (
              <li key={e.id} className={e.level === 'error' ? 'text-[var(--err)]' : e.level === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--text-dim)]'}>
                [{e.node}] [{e.level.toUpperCase()}] {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {node === 'parallel_audit' && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Parallel Audit</h3>
          {/* UX3: detail-on-demand — sub-cards colapsados por padrão. */}
          <details className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">AppSec</summary>
            <p className="mt-1 text-xs text-[var(--text-dim)]">AppSec review details (V1 placeholder).</p>
          </details>
          <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">DevOps</summary>
            <p className="mt-1 text-xs text-[var(--text-dim)]">DevOps review details (V1 placeholder).</p>
          </details>
        </section>
      )}
    </Drawer>
  )
}
