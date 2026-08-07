import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatusEntry } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { Banner } from '../../shared/ui/Banner'
import { Button } from '../../shared/ui/Button'
import { PIPELINE_ORDER } from '../dag/dagModel'
import { deriveSteps, ghostState, type TimelineStep } from './timelineModel'
import { getCheckpoints, getCheckpoint } from '../../shared/lib/api'
import type { NodeType } from '../../shared/lib/types'

type StatusMap = Partial<Record<NodeType, NodeStatusEntry>>

// Timeline (UX5/UX6): barra horizontal entre canvas e console com slider de
// time-travel derivado do canvasStore.nodeStatus (steps = nós não-pending).
// ghostToStep ≠ null → DAG futuro ghosted (buildNodes da T6) + banner fixo de
// inspeção. Checkpoints via API são best-effort: com thread real tenta usar o
// último estado gravado; V1 o backend devolve [{thread_id}] sem checkpoint_id
// (branch dormente) — demo/local segue 100% do nodeStatus.
export function TimelineBar({ runId }: { runId?: string }) {
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  const ghostToStep = useCanvasStore((s) => s.ghostToStep)
  const setGhostToStep = useCanvasStore((s) => s.setGhostToStep)
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)

  const effectiveRunId = runId ?? activeRunId
  const run = runs.find((r) => r.id === effectiveRunId) ?? null

  // Checkpoints best-effort: deriva statuses do channel_values do último
  // checkpoint quando o backend serve checkpoint_id (V1 não serve).
  const [checkpointStatuses, setCheckpointStatuses] = useState<StatusMap | null>(null)
  useEffect(() => {
    let cancelled = false
    setCheckpointStatuses(null)
    const threadId = run?.thread_id
    if (!threadId) return
    getCheckpoints(threadId)
      .then(async (cps) => {
        if (cancelled || cps.length === 0) return
        const last = cps[cps.length - 1] as { checkpoint_id?: string; thread_id: string }
        if (typeof last.checkpoint_id !== 'string') return // V1: [{thread_id}] sem id
        const cp = await getCheckpoint(threadId, last.checkpoint_id)
        if (cancelled) return
        const channel = cp.state?.channel_values as Record<string, unknown> | undefined
        if (channel && (PIPELINE_ORDER as string[]).some((n) => n in channel)) {
          setCheckpointStatuses(channel as StatusMap)
        }
      })
      .catch(() => { /* best-effort — sem backend/dados, timeline segue do nodeStatus */ })
    return () => { cancelled = true }
  }, [run?.thread_id])

  const steps: TimelineStep[] = useMemo(
    () => (checkpointStatuses ? deriveSteps(checkpointStatuses, PIPELINE_ORDER) : deriveSteps(nodeStatus, PIPELINE_ORDER)),
    [checkpointStatuses, nodeStatus],
  )
  const stepCount = steps.length
  const current = ghostToStep ?? stepCount
  const inspecting = ghostToStep !== null

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setGhostToStep(ghostState(Number(e.target.value), steps).ghostToStep)
  }

  return (
    <>
      {/* UX6: banner fixo no topo quando em modo inspeção (acima das abas). */}
      {inspecting && (
        <Banner tone="info">
          <span className="font-medium">Inspection mode — step {current}/{stepCount}</span>
          <Button size="sm" variant="ghost" className="ml-2" onClick={() => setGhostToStep(null)}>
            Back to live
          </Button>
        </Banner>
      )}
      <div data-testid="timeline-bar" className="flex h-10 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-elev)] px-3">
        <span className="whitespace-nowrap text-xs text-[var(--text-dim)]">
          {inspecting ? 'Inspection — ' : 'Live — '}step {current}/{stepCount}
        </span>
        <input
          type="range"
          min={0}
          max={stepCount}
          value={current}
          aria-label="Inspection step"
          className="min-w-0 flex-1 accent-[var(--accent)]"
          onChange={handleChange}
        />
        <Button size="sm" variant="subtle" disabled title="Available in V2">
          Resume from here
        </Button>
        <Button size="sm" variant="ghost" disabled={!inspecting} onClick={() => setGhostToStep(null)}>
          Back to live
        </Button>
      </div>
    </>
  )
}
