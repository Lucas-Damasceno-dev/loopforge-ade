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
import { listRuns, resumeRun, cancelRun, ApiError } from '../../shared/lib/api'
import { useBudgetOverrideStore } from '../costs/budgetOverrideStore'
import { useHitlGateStore } from '../../stores/hitlGateStore'
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
  // pipeline em execução no terminal). Falha (backend down) → aviso legível
  // com "Tentar novamente" (item 2), sem quebrar o modo demo.
  const bootFetched = useRef(false)
  const [bootError, setBootError] = useState<string | null>(null)

  const loadRuns = async () => {
    setBootError(null)
    try {
      const { items } = await listRuns()
      const store = useRunsStore.getState()
      for (const run of items) store.upsertRun(run)
      // Auto-seleciona a primeira run ainda ativa (running/queued/paused) —
      // completed/failed não são re-abertas no boot.
      if (store.activeRunId === null) {
        const active = items.find((r) => r.status === 'running' || r.status === 'queued' || r.status === 'paused')
        if (active) store.selectRun(active.id)
      }
    } catch (e) {
      // Mensagem legível: detail do ApiError quando string; senão genérica em
      // PT (não vazar "API 500: null" cru do wrapper).
      let msg = 'Failed to load runs'
      if (e instanceof ApiError) {
        msg = typeof e.detail === 'string' && e.detail.trim() ? e.detail : 'Engine inacessível — verifique se o backend está rodando'
      } else if (e instanceof Error) {
        msg = e.message
      }
      setBootError(msg)
    }
  }

  useEffect(() => {
    if (bootFetched.current) return
    bootFetched.current = true
    void loadRuns()
  }, [])

  const activeRun = runs.find((r) => r.id === activeRunId) ?? null

  // Origem do paused (item 1): HITL gate (hitlGateStore tem entrada p/ a run —
  // wsBridge registra ao receber hitl_gate_reached) vs budget hard-stop. O
  // banner de espera de decisão humana NÃO oferece Budget override.
  const pendingGate = useHitlGateStore((s) => s.gates.find((g) => g.runId === activeRun?.id))

  const queryClient = useQueryClient()
  const openOverride = useBudgetOverrideStore((s) => s.openOverride)
  const [resuming, setResuming] = useState(false)
  // Erro de resume visível (item 2): antes o catch era vazio — run presa em
  // paused (gate HITL timeout, engine down) sem feedback algum.
  const [resumeError, setResumeError] = useState<string | null>(null)

  // Cancelar (item 1): runs em running/queued/paused são canceláveis; completed
  // e failed nunca. Confirmação inline de 2 cliques (sem modal) + loading +
  // erro de negócio (409) exibido sem fechar nada.
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const activeRunPaused = activeRun?.status === 'paused'
  const runCancellable = activeRun !== null && (activeRun.status === 'running' || activeRun.status === 'queued' || activeRun.status === 'paused')

  const handleCancel = () => {
    if (!runCancellable) return
    if (!confirmCancel) {
      setConfirmCancel(true)
      // Sem segundo clique em 3s, a confirmação volta ao estado inicial.
      window.setTimeout(() => setConfirmCancel(false), 3000)
      return
    }
    void doCancel()
  }

  const doCancel = async () => {
    if (!activeRun) return
    setCancelling(true)
    setConfirmCancel(false)
    setCancelError(null)
    try {
      const updated = await cancelRun(activeRun.id)
      // Fallback local: o backend emite run_updated via WS (wsBridge já trata),
      // mas se o evento não chegar a UI segue consistente com o resultado.
      useRunsStore.getState().upsertRun(updated)
      queryClient.invalidateQueries({ queryKey: ['run-cost', activeRun.id] })
    } catch (e) {
      // 409 (run não cancelável) e outros erros de negócio — mensagem real do
      // backend, sem fechar/alterar o estado da run.
      let msg = e instanceof Error ? e.message : 'Cancel failed'
      if (e instanceof ApiError && typeof e.detail === 'string' && e.detail.trim()) msg = e.detail
      setCancelError(msg)
    } finally {
      setCancelling(false)
    }
  }

  const handleResume = async () => {
    if (!activeRun) return
    setResuming(true)
    setResumeError(null)
    try {
      const updated = await resumeRun(activeRun.id)
      useRunsStore.getState().upsertRun(updated)
      queryClient.invalidateQueries({ queryKey: ['run-cost', activeRun.id] })
    } catch (e) {
      // Erro de resume (backend down, run não-resumível…): mensagem real do
      // ApiError (detail) ou genérica — a run permanece paused na UI.
      let msg = e instanceof Error ? e.message : 'Failed to resume run'
      if (e instanceof ApiError && typeof e.detail === 'string' && e.detail.trim()) msg = e.detail
      setResumeError(msg)
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
            {/* Cancelar (item 1): 2 cliques — 1º arma "Confirm cancel?", 2º
                dispara. Nunca aparece para completed/failed. */}
            {runCancellable && (
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : confirmCancel ? 'Confirm cancel?' : 'Cancel'}
              </Button>
            )}
            {cancelError && (
              <span role="alert" className="text-xs text-[var(--err-text)]">{cancelError}</span>
            )}
            {resumeError && (
              <span role="alert" className="text-xs text-[var(--err-text)]">{resumeError}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => runDemo()}>Run demo</Button>
            <NewRunForm onCreated={handleCreated} />
          </div>
        </>
      )}
      <div className="relative flex-1 overflow-hidden">
        {bootError && (
          <Alert tone="err" data-testid="boot-error" className="absolute left-3 right-3 top-3 z-20 flex items-center gap-3">
            <span>Não foi possível carregar runs — {bootError}</span>
            <Button size="sm" variant="subtle" onClick={() => void loadRuns()}>
              Tentar novamente
            </Button>
          </Alert>
        )}
        {activeRunPaused && activeRun && (
          pendingGate ? (
            /* Item 1: paused por HITL gate — aguardando decisão humana no
               drawer; sem Budget override (budget não é a causa). */
            <Alert tone="info" data-testid="run-hitl-banner">
              Run paused — waiting for your decision at gate {pendingGate.gateNode}.
            </Alert>
          ) : (
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
          )
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
