import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunsWorkspace } from '../features/runs/RunsWorkspace'
import { ConsolePanel } from '../features/console/ConsolePanel'
import { InspectDrawer } from '../features/dag/InspectDrawer'
import { HitlDrawer } from '../features/hitl/HitlDrawer'
import { HitlGateBanner } from '../features/hitl/HitlGateBanner'
import { TimelineBar } from '../features/timeline/TimelineBar'
import { CostBar } from '../features/costs/CostBar'
import { McpPlayground } from '../features/mcp/McpPlayground'
import { TrajectoriesPanel } from '../features/trajectories/TrajectoriesPanel'
import { MemoryPanel } from '../features/memory/MemoryPanel'
import { EvalsPanel } from '../features/evals/EvalsPanel'
import { GitPanel } from '../features/git/GitPanel'
import { HealthPanel } from '../features/health/HealthPanel'
import { PromptPanel } from '../features/prompts/PromptPanel'
import { SettingsPanel } from '../features/settings/SettingsPanel'
import { ArtifactsPanel } from '../features/artifacts/ArtifactsPanel'
import { TerminalPanel } from '../features/terminal/TerminalPanel'
import { AstPanel } from '../features/ast/AstPanel'
import { CoveragePanel } from '../features/coverage/CoveragePanel'
import { DockerPanel } from '../features/docker/DockerPanel'
import { ApiKeyGate } from '../features/auth/ApiKeyGate'
import { ToastContainer } from '../shared/ui/ToastContainer'
import { Drawer } from '../shared/ui/Drawer'
import { Topbar } from '../shared/ui/Topbar'
import { ActivityRail } from '../shared/ui/ActivityRail'
import { Button } from '../shared/ui/Button'
import { SplitPane } from '../shared/ui/SplitPane'
import { useWsStore } from '../stores/wsStore'
import { useRunsStore } from '../stores/runsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useConsoleStore } from '../stores/consoleStore'
import { useViewStore } from '../stores/viewStore'
import { shortId } from '../features/trajectories/shortId'

const queryClient = new QueryClient()

// Navegação de views (T2): WORKSPACE_GROUPS + VIEWS_META vivem em
// src/shared/lib/views.ts (fonte única) — o rail de atividade deriva deles.

// Layout completo: QueryClientProvider + topbar + workspace de runs.
// Conecta o WS uma única vez (guard ref p/ StrictMode double-effect).
export function App() {
  const connected = useRef(false)
  // Focus mode (01b §6.1): Fullscreen API real — oculta topbar + chrome das
  // runs; restam canvas e console. Indicador discreto no canto do canvas.
  const [fullscreen, setFullscreen] = useState(false)
  // View ativa do shell (T2): alimenta o ActivityRail (ativo) e deriva o `open`
  // dos drawers/painéis abaixo. Semântica de toggle no store (openView).
  const activeView = useViewStore((s) => s.activeView)
  const openView = useViewStore((s) => s.openView)
  const closeView = useViewStore((s) => s.closeView)
  // Run ativa (selecionada nas tabs) — alimenta o GitPanel (repo da run).
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const activeRun = runs.find((r) => r.id === activeRunId) ?? null
  // Estado do canvas p/ política de drawers sobrepostos (P2): fechar o
  // Inspect quando a run pausa (HITL abre).
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  // Console resizável (P1-3): SplitPane só quando há conteúdo — vazio flui
  // colapsado (mesma regra de auto-expand do ConsolePanel, sem área morta).
  const consoleHasContent = useConsoleStore((s) => s.entries.length > 0 || Object.keys(s.streams).length > 0)

  useEffect(() => {
    if (connected.current) return
    connected.current = true
    useWsStore.getState().connect()
  }, [])

  // Focus mode honesto (auditoria): NÃO sobrescreve F11 do browser — usa a
  // Fullscreen API real (Esc sai nativamente). try/catch cobre ambientes sem
  // suporte (ex.: iframe sem allowfullscreen).
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Fullscreen API indisponível — ignora silenciosamente.
    }
  }

  // P1-7: título da aba reflete o estado da run ativa (multitab/headless).
  useEffect(() => {
    if (!activeRun) {
      document.title = 'LoopForge ADE'
      return
    }
    document.title = `Run #${shortId(activeRun.id)} — ${activeRun.status} · LoopForge ADE`
  }, [activeRun])

  // Drawers sobrepostos (P2): InspectDrawer (selectedNodeId) e HitlDrawer
  // (nó paused) compartilham z-[50]. Política: na TRANSIÇÃO sem-pausado →
  // pausado (HITL abre), fecha o Inspect — ref guard evita fechar seleção
  // durante inspeção enquanto a run segue pausada.
  const hadPaused = useRef(false)
  useEffect(() => {
    const hasPaused = Object.values(nodeStatus).some((n) => n.status === 'paused')
    if (hasPaused && !hadPaused.current) {
      useCanvasStore.getState().selectNode(null)
    }
    hadPaused.current = hasPaused
  }, [nodeStatus])

  // Views sem painel próprio (runs/prompt/agents/pipelines) ficam só ativas
  // no rail (T2); as demais abrem drawer nesta fase (SidebarHost na T3).

  // Região canvas + timeline flutuante — reusada no SplitPane (console com
  // conteúdo) e no fluxo plano (console colapsado). O wrapper flex-col garante
  // que a TimelineBar (h-0) ancore na base do canvas, acima do console.
  // `fill` diferencia os contextos: dentro do SplitPane o pai é block (h-full
  // necessário); no fluxo plano o pai é flex-col (flex-1).
  const canvasRegion = (fill: boolean) => (
    <div className={`relative flex min-h-0 flex-col ${fill ? 'h-full' : 'flex-1'}`}>
      <div className="relative min-h-0 flex-1 border-b border-[var(--border)]">
        <RunsWorkspace hideChrome={fullscreen} />
        {fullscreen && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-[var(--bg-elev)] px-2 py-1 text-xs text-[var(--text-dim)] shadow-[var(--shadow-xs)]">
            Press Esc to exit fullscreen
          </div>
        )}
      </div>
      <TimelineBar />
    </div>
  )

  return (
    <QueryClientProvider client={queryClient}>
      <main data-testid="app-root" className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        {!fullscreen && (
          <Topbar
            right={
              <>
                {/* UX12: badge de orçamento global sempre visível. */}
                <CostBar />
                {/* Focus mode (Fullscreen API): canvas + console sem chrome. */}
                <Button size="sm" variant="subtle" title="Focus mode — canvas + console em fullscreen" onClick={toggleFullscreen}>
                  Focus
                </Button>
              </>
            }
          />
        )}
        {/* Banner de gate HITL (C3/M-12): informativo, descartável, não-bloqueante. */}
        {!fullscreen && <HitlGateBanner />}
        {/* Shell (T2): rail de atividade 48px à esquerda + área principal. O
            rail some em fullscreen (Focus mode — canvas e console sem chrome). */}
        <div className="flex min-h-0 flex-1">
          {!fullscreen && <ActivityRail active={activeView} onSelect={openView} />}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Região canvas + console (P1-3): SplitPane resizável quando o console
                tem conteúdo (drag no divider ajusta a altura); vazio flui colapsado
                sem área reservada (mesma regra do auto-collapse do ConsolePanel). */}
            {consoleHasContent ? (
              <div className="min-h-0 flex-1">
                <SplitPane
                  direction="vertical"
                  initialSize={240}
                  minSize={120}
                  maxSize={typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.7) : 560}
                  reversed
                >
                  <ConsolePanel className="h-full" />
                  {canvasRegion(true)}
                </SplitPane>
              </div>
            ) : (
              <>
                {canvasRegion(false)}
                <ConsolePanel />
              </>
            )}
          </div>
        </div>
        {/* Drawer de inspeção (portal p/ body) — abre com nó selecionado no canvas. */}
        <InspectDrawer />
        {/* Drawer HITL (portal p/ body) — complementar: abre com nó paused. */}
        <HitlDrawer />
        {/* Trajetórias (Fase C): fork/export/import/timeline por run. */}
        <TrajectoriesPanel open={activeView === 'trajectories'} onClose={closeView} />
        {/* Artefatos e arquivos gerados pela IA no workspace da run ativa. */}
        <ArtifactsPanel open={activeView === 'artifacts'} onClose={closeView} runId={activeRunId} />
        {/* Terminal interativo web para execução de comandos no workspace da run. */}
        <TerminalPanel open={activeView === 'terminal'} onClose={closeView} runId={activeRunId} />
        {/* Visualizador de AST e mapa de dependências de código. */}
        <AstPanel open={activeView === 'ast'} onClose={closeView} runId={activeRunId} />
        {/* Relatório e métricas de cobertura de código de testes. */}
        <CoveragePanel open={activeView === 'coverage'} onClose={closeView} runId={activeRunId} />
        {/* Exportador e gerador de ambientes Docker e devcontainer. */}
        <DockerPanel open={activeView === 'docker'} onClose={closeView} runId={activeRunId} />
        {/* Playground MCP (feature #5, V1 parcial) — drawer aberto pelo rail. */}
        <Drawer open={activeView === 'mcp'} title="MCP Playground" onClose={closeView}>
          <McpPlayground />
        </Drawer>
        {/* Memória (lessons engine): busca/cria/remove lições aprendidas. */}
        <MemoryPanel open={activeView === 'memory'} onClose={closeView} />
        {/* Evals (5º pilar BLUEPRINT): resumo de runs/benchmarks + leaderboard. */}
        <EvalsPanel open={activeView === 'evals'} onClose={closeView} />
        {/* Git (Tier2): branch/status/log da run ativa (query só com runId). */}
        <GitPanel open={activeView === 'git'} onClose={closeView} runId={activeRunId ?? ''} />
        {/* Health (Tier2): polling /health 10s + status telemetria. */}
        <HealthPanel open={activeView === 'health'} onClose={closeView} />
        {/* Prompts (Tier2): overrides de prompt por persona (get_effective_prompt). */}
        <PromptPanel open={activeView === 'prompts'} onClose={closeView} />
        {/* Settings (Fase D/E9): budget/HITL/providers/toggles MCP. */}
        <SettingsPanel open={activeView === 'settings'} onClose={closeView} />
        {/* Gate de API key (B2/M-20): overlay em 401/sem key; dispensável p/ demo. */}
        <ApiKeyGate />
        {/* Notificações flutuantes globais (toasts). */}
        <ToastContainer />
      </main>
    </QueryClientProvider>
  )
}
