import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatusEntry } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { Button } from '../../shared/ui/Button'
import { PIPELINE_ORDER } from '../dag/dagModel'
import { deriveSteps, ghostState, type TimelineStep } from './timelineModel'
import { getCheckpoints, getCheckpoint } from '../../shared/lib/api'
import type { NodeType } from '../../shared/lib/types'

type StatusMap = Partial<Record<NodeType, NodeStatusEntry>>

// Timeline (UX5/UX6): barra flutuante ancorada na base do canvas com slider de
// time-travel derivado do canvasStore.nodeStatus (steps = nós não-pending).
// ghostToStep ≠ null → DAG futuro ghosted (buildNodes da T6) + estado de
// inspeção na própria barra. Checkpoints via API são best-effort: com thread
// real tenta usar o último estado gravado; V1 o backend devolve [{thread_id}]
// sem checkpoint_id (branch dormente) — demo/local segue 100% do nodeStatus.
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

// Barra flutuante (Gemini/P0.10): o TimelineBar vive em fluxo normal no App
// (logo após a área flex-1 do workspace) — o wrapper `relative h-0` ancora a
// barra na base do canvas, sem roubar espaço do layout. Decisões:
// - Banner fixo de inspeção REMOVIDO: status e ações concentrados na barra
//   (elimina o "Back to live" duplicado — resta só o da barra).
// - "Resume from here" só renderiza em inspeção (nunca disabled permanente);
//   V1 sem resume no server: retorna à visualização live (ghost limpo).
// - Toda a lógica (steps, ghosting, onSeek, checkpoints) permanece intacta —
//   mudou só apresentação/posicionamento.
  if (stepCount === 0) return null

  return (
    <div data-testid="timeline-bar" className="relative h-0">
      <div className="absolute bottom-2 left-1/2 z-20 flex w-[32rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elev)]/95 px-3 py-1.5 shadow-lg backdrop-blur-md">
        {/* Emoji → dot de estado (auditoria de design): sem ícone equivalente
            em icons.tsx; cor de estado comunica o modo — err = live, accent = inspeção. */}
        <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs text-[var(--text-dim)]">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${inspecting ? 'bg-[var(--accent)]' : 'bg-[var(--err)]'}`} />
          {inspecting ? 'Inspection — ' : 'Live — '}step {current}/{stepCount}
        </span>

        {/* Step replay controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous step"
            title="Step backward (time-travel)"
            disabled={current <= 0}
            onClick={() => {
              const prev = Math.max(0, current - 1)
              setGhostToStep(prev === stepCount ? null : prev)
            }}
            className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-elev-2)] text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-elev)] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next step"
            title="Step forward (time-travel)"
            disabled={current >= stepCount}
            onClick={() => {
              const next = current + 1
              setGhostToStep(next >= stepCount ? null : next)
            }}
            className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-elev-2)] text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-elev)] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={stepCount}
          value={current}
          aria-label="Inspection step"
          className="ade-slider min-w-0 flex-1 cursor-pointer"
          onChange={handleChange}
        />
        {/* Ação única (auditoria de design): "Resume from here" e "Back to live"
            eram duplicadas — ambas só limpavam o ghost (V1 sem resume no server).
            Rótulo depende do estado: inspeção → "Back to live"; live → "Resume from here". */}
        <Button
          size="sm"
          variant={inspecting ? 'subtle' : 'ghost'}
          aria-label={inspecting ? 'Back to live' : 'Resume from here'}
          onClick={() => setGhostToStep(null)}
        >
          {inspecting ? 'Back to live' : 'Resume from here'}
        </Button>
      </div>
    </div>
  )
}
