import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRunsStore } from '../../stores/runsStore'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { FlowCanvas } from '../dag/FlowCanvas'
import { RunTabs } from './RunTabs'
import { QueueBadge } from './QueueBadge'
import { NewRunForm } from './NewRunForm'
import { runDemo } from './demoMock'
import { listRuns, resumeRun } from '../../shared/lib/api'
import { useBudgetOverrideStore } from '../costs/budgetOverrideStore'
import { Alert } from '../../shared/ui/Alert'
import type { Run } from '../../shared/lib/types'

// Workspace de runs: barra de abas (UX11) + toolbar (demo/form) + painel
// principal (empty state OU FlowCanvas da run ativa). A fila (E3) aparece
// como badge de status "Queued" nas abas. hideChrome = fullscreen (F11, §6.1):
// restam apenas canvas e console.
export function RunsWorkspace({ hideChrome = false }: { hideChrome?: boolean }) {
  const runs = useRunsStore((s) => s.runs)
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const queue = useRunsStore((s) => s.queue)
  const cbByRun = useRunsStore((s) => s.cbByRun)
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

  const queryClient = useQueryClient()
  const openOverride = useBudgetOverrideStore((s) => s.openOverride)
  const [resuming, setResuming] = useState(false)

  const activeRunPaused = activeRun?.status === 'paused'

  const handleResume = async () => {
    if (!activeRun) return
    setResuming(true)
    try {
      const updated = await resumeRun(activeRun.id)
      useRunsStore.getState().upsertRun(updated)
      queryClient.invalidateQueries({ queryKey: ['run-cost', activeRun.id] })
    } catch {
      // Erro de resume: mantém status paused (o log do console já cobre).
    } finally {
      setResuming(false)
    }
  }

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
          <RunTabs runs={runs} activeRunId={activeRunId} queue={queue} cbByRun={cbByRun} onSelect={selectRun} onClose={handleClose} />
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            {/* P0 surfacing: badge da fila E3 (ativos/máx + espera) — polling 5s. */}
            <QueueBadge />
            {/* Demo rebaixado (Gemini): secundário — a ação principal é o
                prompt customizado (grupo do NewRunForm). */}
            {activeRunPaused && (
              <Button size="sm" variant="primary" onClick={handleResume} disabled={resuming}>
                {resuming ? 'Resuming…' : 'Resume'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => runDemo()}>Run demo</Button>
            <NewRunForm onCreated={handleCreated} />
          </div>
        </>
      )}
      <div className="relative flex-1 overflow-hidden">
        {activeRunPaused && activeRun && (
          <Alert tone="warn" data-testid="run-paused-banner">
            Run paused — budget hard-stop reached. Adjust budget or resume.
            <span className="ml-2 inline-flex gap-2">
              <Button size="sm" variant="primary" onClick={handleResume} disabled={resuming}>
                {resuming ? 'Resuming…' : 'Resume'}
              </Button>
              <Button size="sm" variant="subtle" onClick={() => openOverride(activeRun.id)}>
                Budget override
              </Button>
            </span>
          </Alert>
        )}
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
                <Button variant="ghost" size="md" onClick={() => runDemo()}>
                  Run example pipeline
                </Button>
                <Button variant="subtle" size="md" onClick={() => document.getElementById('new-run-idea')?.focus()}>
                  Create new run
                </Button>
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}
