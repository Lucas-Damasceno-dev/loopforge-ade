import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunsWorkspace } from '../features/runs/RunsWorkspace'
import { ConsolePanel } from '../features/console/ConsolePanel'
import { InspectDrawer } from '../features/dag/InspectDrawer'
import { HitlDrawer } from '../features/hitl/HitlDrawer'
import { HitlGateBanner } from '../features/hitl/HitlGateBanner'
import { TimelineBar } from '../features/timeline/TimelineBar'
import { BudgetPill } from '../features/costs/BudgetPill'
import { useBudgetOverrideStore } from '../features/costs/budgetOverrideStore'
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
import { SidebarHost } from '../shared/ui/SidebarHost'
import { Button } from '../shared/ui/Button'
import { SplitPane } from '../shared/ui/SplitPane'
import { PANEL_VIEWS } from '../shared/lib/views'
import type { ViewKey } from '../shared/lib/views'
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
  // View expandida (T3): views pesadas (resumo na sidebar) abrem o drawer
  // completo via "Open panel" — estado separado do activeView (a sidebar fica
  // aberta por baixo; o overlay do Drawer cobre o resto). Resetado a cada
  // troca de view para o drawer nunca ficar órfão.
  const [expandedView, setExpandedView] = useState<ViewKey | null>(null)
  useEffect(() => {
    setExpandedView(null)
  }, [activeView])
  // Drawer aberto = view expandida com painel próprio (PANEL_VIEWS: fonte
  // única das views com drawer — views leves da T3 não expandem).
  const drawerOpen = (key: ViewKey) => PANEL_VIEWS.includes(key) && expandedView === key
  const handleExpand = () => {
    if (activeView) setExpandedView(activeView)
  }
  // Fecha SÓ o drawer expandido (fix round 1, F3): a sidebar (activeView)
  // permanece aberta com o resumo — fechar a view é responsabilidade do
  // X/Esc da SidebarHost. Antes chamava closeView() e derrubava a sidebar.
  const handleDrawerClose = () => {
    setExpandedView(null)
  }
  // Run ativa (selecionada nas tabs) — alimenta o GitPanel (repo da run).
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const activeRun = runs.find((r) => r.id === activeRunId) ?? null
  // Override de budget (T4): BudgetPill abre o modal via store (mesmo fluxo
  // que o CostBar tinha; o modal agora vive dentro do BudgetPill).
  const openBudgetOverride = useBudgetOverrideStore((s) => s.openOverride)
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

  // Views leves (T3) vivem na sub-sidebar (SidebarHost); pesadas abrem o
  // drawer via "Open panel" (expandedView) — ver SidebarHost.

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
      {/* Budget flutuante (T4): pill no canto inferior esquerdo do canvas —
          substitui o CostBar da topbar (saiu do chrome p/ perto da ação). */}
      <BudgetPill
        runId={activeRunId}
        onOverride={() => {
          if (activeRunId) openBudgetOverride(activeRunId)
        }}
      />
    </div>
  )

  return (
    <QueryClientProvider client={queryClient}>
      <main data-testid="app-root" className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        {!fullscreen && (
          <Topbar
            /* Trigger central da command palette (T4 slot; wiring real na
               Task 7 — placeholder desabilitado). */
            center={
              <button
                type="button"
                disabled
                title="Command palette (coming in task 7)"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1 text-xs text-[var(--text-dim)] transition-colors duration-[var(--dur-fast)]"
              >
                <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elev-2)] px-1 font-mono text-(--text-2xs) text-[var(--text-dim)]">
                  ⌘K
                </kbd>
                <span>Open command palette…</span>
              </button>
            }
            right={
              <>
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
          {/* Sub-sidebar 260px (T3): conteúdo por view — leves inline, pesadas
              resumo + "Open panel". Oculta em fullscreen (Focus mode). */}
          {!fullscreen && <SidebarHost active={activeView} onClose={closeView} onExpand={handleExpand} />}
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
        <TrajectoriesPanel open={drawerOpen('trajectories')} onClose={handleDrawerClose} />
        {/* Artefatos e arquivos gerados pela IA no workspace da run ativa. */}
        <ArtifactsPanel open={drawerOpen('artifacts')} onClose={handleDrawerClose} runId={activeRunId} />
        {/* Terminal interativo web para execução de comandos no workspace da run. */}
        <TerminalPanel open={drawerOpen('terminal')} onClose={handleDrawerClose} runId={activeRunId} />
        {/* Visualizador de AST e mapa de dependências de código. */}
        <AstPanel open={drawerOpen('ast')} onClose={handleDrawerClose} runId={activeRunId} />
        {/* Relatório e métricas de cobertura de código de testes. */}
        <CoveragePanel open={drawerOpen('coverage')} onClose={handleDrawerClose} runId={activeRunId} />
        {/* Exportador e gerador de ambientes Docker e devcontainer. */}
        <DockerPanel open={drawerOpen('docker')} onClose={handleDrawerClose} runId={activeRunId} />
        {/* Playground MCP (feature #5, V1 parcial) — drawer aberto pelo rail. */}
        <Drawer open={drawerOpen('mcp')} title="MCP Playground" onClose={handleDrawerClose}>
          <McpPlayground />
        </Drawer>
        {/* Memória (lessons engine): conteúdo migrado p/ sub-sidebar (T3);
            drawer permanece disponível p/ uso direto (open sempre false aqui). */}
        <MemoryPanel open={false} onClose={handleDrawerClose} />
        {/* Evals (5º pilar BLUEPRINT): resumo de runs/benchmarks + leaderboard. */}
        <EvalsPanel open={drawerOpen('evals')} onClose={handleDrawerClose} />
        {/* Git (Tier2): branch/status/log da run ativa (query só com runId). */}
        <GitPanel open={false} onClose={handleDrawerClose} runId={activeRunId ?? ''} />
        {/* Health (Tier2): polling /health 10s + status telemetria. */}
        <HealthPanel open={false} onClose={handleDrawerClose} />
        {/* Prompts (Tier2): overrides de prompt por persona (get_effective_prompt). */}
        <PromptPanel open={false} onClose={handleDrawerClose} />
        {/* Settings (Fase D/E9): budget/HITL/providers/toggles MCP. */}
        <SettingsPanel open={false} onClose={handleDrawerClose} />
        {/* Gate de API key (B2/M-20): overlay em 401/sem key; dispensável p/ demo. */}
        <ApiKeyGate />
        {/* Notificações flutuantes globais (toasts). */}
        <ToastContainer />
      </main>
    </QueryClientProvider>
  )
}
