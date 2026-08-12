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

  // E3 (paralelismo real): o server executa N runs simultâneas e publica o
  // status `queued` via WS — a fila é derivada dos status no store. A nova run
  // é sempre selecionada (view focus); a gestão de execução é do server.
  const handleCreated = (run: Run) => {
    useRunsStore.getState().upsertRun(run)
    useRunsStore.getState().selectRun(run.id)
  }

  return (
    <div className="flex h-full flex-col" data-testid="runs-workspace">
      {!hideChrome && (
        <>
          <RunTabs runs={runs} activeRunId={activeRunId} queue={queue} onSelect={selectRun} onClose={handleClose} />
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            {/* Demo rebaixado (Gemini): secundário — a ação principal é o
                prompt customizado (grupo do NewRunForm). */}
            <Button variant="ghost" size="sm" onClick={() => runDemo()}>Run demo</Button>
            <NewRunForm onCreated={handleCreated} />
          </div>
        </>
      )}
      <div className="relative flex-1 overflow-hidden">
        {activeRun ? (
          <FlowCanvas />
        ) : (
          /* Empty state interativo (Gemini/P0.7/P0.12): cards de início rápido
             em vez de tela parada — demo dispara pipeline de exemplo; o outro
             foca o campo de ideia do NewRunForm (id fixo definido lá). */
          <EmptyState
            title="No active run"
            description="Start a run to see the pipeline in action"
            action={
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => runDemo()}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition-colors duration-100 hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Run example pipeline
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('new-run-idea')?.focus()}
                  className="rounded-md border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--text-dim)] transition-colors duration-100 hover:border-[var(--border-hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Create new run
                </button>
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}
