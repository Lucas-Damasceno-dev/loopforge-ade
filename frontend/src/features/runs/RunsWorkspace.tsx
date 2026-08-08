import { useEffect, useRef } from 'react'
import { useRunsStore } from '../../stores/runsStore'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { FlowCanvas } from '../dag/FlowCanvas'
import { RunTabs } from './RunTabs'
import { NewRunForm } from './NewRunForm'
import { runDemo } from './demoMock'
import { listRuns } from '../../shared/lib/api'
import type { Run } from '../../shared/lib/types'

// Workspace de runs: barra de abas (UX11) + toolbar (demo/form) + painel
// principal (empty state OU FlowCanvas da run ativa). A fila (E3) aparece
// como abas com rótulo "queued". hideChrome = fullscreen (F11, §6.1): restam
// apenas canvas e console.
export function RunsWorkspace({ hideChrome = false }: { hideChrome?: boolean }) {
  const runs = useRunsStore((s) => s.runs)
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const queue = useRunsStore((s) => s.queue)
  const selectRun = useRunsStore((s) => s.selectRun)
  const removeRun = useRunsStore((s) => s.removeRun)

  // Boot: busca runs existentes no backend (após reload a run que segue
  // rodando no server precisa voltar a aparecer — sem isso o store só sabe de
  // runs criadas nesta sessão e a UI fica em "No active run" mesmo com o
  // pipeline em execução no terminal).
  const bootFetched = useRef(false)
  useEffect(() => {
    if (bootFetched.current) return
    bootFetched.current = true
    listRuns()
      .then(({ items }) => {
        const store = useRunsStore.getState()
        for (const run of items) store.upsertRun(run)
        // Auto-seleciona a primeira run ainda ativa (running/queued/paused) —
        // completed/failed não são re-abertas no boot.
        if (store.activeRunId === null) {
          const active = items.find((r) => r.status === 'running' || r.status === 'queued' || r.status === 'paused')
          if (active) store.selectRun(active.id)
        }
      })
      .catch(() => { /* demo/sem backend: segue no empty state */ })
  }, [])

  const activeRun = runs.find((r) => r.id === activeRunId) ?? null

  const handleClose = (id: string) => {
    removeRun(id)
    if (id === activeRunId) selectRun(null)
  }

  // E3: sem run ativa → a nova vira ativa; com ativa → vai para a fila.
  const handleCreated = (run: Run) => {
    useRunsStore.getState().upsertRun(run)
    const state = useRunsStore.getState()
    if (state.activeRunId === null) state.selectRun(run.id)
    else if (state.activeRunId !== run.id) state.enqueue(run.id)
  }

  return (
    <div className="flex h-full flex-col" data-testid="runs-workspace">
      {!hideChrome && (
        <>
          <RunTabs runs={runs} activeRunId={activeRunId} queue={queue} onSelect={selectRun} onClose={handleClose} />
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <Button variant="primary" size="sm" onClick={() => runDemo()}>Run demo</Button>
            <NewRunForm onCreated={handleCreated} />
          </div>
        </>
      )}
      <div className="relative flex-1 overflow-hidden">
        {activeRun ? (
          <FlowCanvas />
        ) : (
          <EmptyState
            title="No active run"
            description="Start a run to see the pipeline in action"
          />
        )}
      </div>
    </div>
  )
}
