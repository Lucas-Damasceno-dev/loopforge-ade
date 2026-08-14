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
import { Topbar, TopbarAction } from '../shared/ui/Topbar'
import { Button } from '../shared/ui/Button'
import { SplitPane } from '../shared/ui/SplitPane'
import { useWsStore } from '../stores/wsStore'
import { useRunsStore } from '../stores/runsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useConsoleStore } from '../stores/consoleStore'
import { shortId } from '../features/trajectories/shortId'

const queryClient = new QueryClient()

// ─── Navegação de views (P1-1) ────────────────────────────────────────────
// Fonte única dos 13 tools: topbar (nav inline ≥1024px) e rail mobile
// (<1024px, drawer via onMenu). Mesmos rótulos/ícones/ordem de antes — só a
// renderização foi extraída p/ reuso (sem mudança de comportamento).
const WORKSPACE_GROUPS = [
  {
    group: 'Workspace & Código',
    views: [
      { key: 'artifacts', label: 'Artifacts', icon: 'artifacts' },
      { key: 'terminal', label: 'Terminal', icon: 'terminal' },
      { key: 'ast', label: 'AST & Deps', icon: 'ast' },
      { key: 'coverage', label: 'Coverage', icon: 'coverage' },
      { key: 'docker', label: 'Docker', icon: 'docker' },
    ],
  },
  {
    group: 'Engine & Memória',
    views: [
      { key: 'trajectories', label: 'Trajectories', icon: 'trajectories' },
      { key: 'mcp', label: 'MCP playground', icon: 'mcp' },
      { key: 'memory', label: 'Memory', icon: 'memory' },
      { key: 'evals', label: 'Evals', icon: 'evals' },
    ],
  },
  {
    group: 'Sistema & Configurações',
    views: [
      { key: 'git', label: 'Git', icon: 'git' },
      { key: 'health', label: 'Health', icon: 'health' },
      { key: 'prompts', label: 'Prompts', icon: 'prompts' },
      { key: 'settings', label: 'Settings', icon: 'settings' },
    ],
  },
] as const

function WorkspaceNav({
  open,
  onOpen,
  vertical = false,
}: {
  open: Record<string, boolean>
  onOpen: (key: string) => void
  vertical?: boolean
}) {
  if (vertical) {
    // Rail mobile: pilha com rótulos sempre visíveis (showLabel) + seção por grupo.
    return (
      <nav aria-label="Workspace views" className="flex flex-col gap-4">
        {WORKSPACE_GROUPS.map(({ group, views }) => (
          <div key={group}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">{group}</p>
            <div className="flex flex-col gap-0.5">
              {views.map((view) => (
                <TopbarAction
                  key={view.key}
                  label={view.label}
                  icon={view.icon}
                  showLabel
                  active={open[view.key]}
                  onClick={() => onOpen(view.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    )
  }
  // Nav inline (≥1024px): grupos com separadores; scrollbar oculta (P2-10) —
  // <1024px fica `hidden` e o rail mobile assume.
  return (
    <nav
      aria-label="Workspace views"
      className="hidden items-center gap-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-elev)] p-0.5 lg:flex [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {WORKSPACE_GROUPS.map(({ group, views }, gi) => (
        <div key={group} className="flex items-center gap-0.5">
          {gi > 0 && <div className="h-4 w-px bg-[var(--border)]" />}
          {views.map((view) => (
            <TopbarAction
              key={view.key}
              label={view.label}
              icon={view.icon}
              active={open[view.key]}
              onClick={() => onOpen(view.key)}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}

// Layout completo: QueryClientProvider + topbar + workspace de runs.
// Conecta o WS uma única vez (guard ref p/ StrictMode double-effect).
export function App() {
  const connected = useRef(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [astOpen, setAstOpen] = useState(false)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [dockerOpen, setDockerOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [trajectoriesOpen, setTrajectoriesOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [evalsOpen, setEvalsOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [promptsOpen, setPromptsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Focus mode (01b §6.1): Fullscreen API real — oculta topbar + chrome das
  // runs; restam canvas e console. Indicador discreto no canto do canvas.
  const [fullscreen, setFullscreen] = useState(false)
  // Run ativa (selecionada nas tabs) — alimenta o GitPanel (repo da run).
  const activeRunId = useRunsStore((s) => s.activeRunId)
  const runs = useRunsStore((s) => s.runs)
  const activeRun = runs.find((r) => r.id === activeRunId) ?? null
  // Estado do canvas p/ política de drawers sobrepostos (P2): fechar o
  // Inspect quando a run pausa (HITL abre).
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  // Rail mobile (P1-1): Topbar `onMenu` abre o drawer de navegação <1024px.
  const [menuOpen, setMenuOpen] = useState(false)
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

  // Abre uma view pelo key (nav inline e rail mobile compartilham — fechar o
  // rail ao navegar evita drawer sobre drawer).
  const openView = (key: string) => {
    setMenuOpen(false)
    switch (key) {
      case 'artifacts': setArtifactsOpen(true); break
      case 'terminal': setTerminalOpen(true); break
      case 'ast': setAstOpen(true); break
      case 'coverage': setCoverageOpen(true); break
      case 'docker': setDockerOpen(true); break
      case 'trajectories': setTrajectoriesOpen(true); break
      case 'mcp': setMcpOpen(true); break
      case 'memory': setMemoryOpen(true); break
      case 'evals': setEvalsOpen(true); break
      case 'git': setGitOpen(true); break
      case 'health': setHealthOpen(true); break
      case 'prompts': setPromptsOpen(true); break
      case 'settings': setSettingsOpen(true); break
    }
  }
  const viewsOpen: Record<string, boolean> = {
    artifacts: artifactsOpen, terminal: terminalOpen, ast: astOpen, coverage: coverageOpen, docker: dockerOpen,
    trajectories: trajectoriesOpen, mcp: mcpOpen, memory: memoryOpen, evals: evalsOpen,
    git: gitOpen, health: healthOpen, prompts: promptsOpen, settings: settingsOpen,
  }

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
            onMenu={() => setMenuOpen(true)}
            right={
              <>
                {/* UX12: badge de orçamento global sempre visível. */}
                <CostBar />
                {/* Navegação segmented em grupos lógicos com separadores visuais.
                    <1024px fica hidden (rail mobile via botão Menu da Topbar). */}
                <WorkspaceNav open={viewsOpen} onOpen={openView} />
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
        {/* Drawer de inspeção (portal p/ body) — abre com nó selecionado no canvas. */}
        <InspectDrawer />
        {/* Drawer HITL (portal p/ body) — complementar: abre com nó paused. */}
        <HitlDrawer />
        {/* Trajetórias (Fase C): fork/export/import/timeline por run. */}
        <TrajectoriesPanel open={trajectoriesOpen} onClose={() => setTrajectoriesOpen(false)} />
        {/* Rail mobile (P1-1): navegação completa <1024px — Drawer não-modal,
            mesmo padrão das demais views; fecha ao navegar (openView). */}
        <Drawer open={menuOpen} title="Workspace" onClose={() => setMenuOpen(false)}>
          <WorkspaceNav vertical open={viewsOpen} onOpen={openView} />
        </Drawer>
        {/* Artefatos e arquivos gerados pela IA no workspace da run ativa. */}
        <ArtifactsPanel open={artifactsOpen} onClose={() => setArtifactsOpen(false)} runId={activeRunId} />
        {/* Terminal interativo web para execução de comandos no workspace da run. */}
        <TerminalPanel open={terminalOpen} onClose={() => setTerminalOpen(false)} runId={activeRunId} />
        {/* Visualizador de AST e mapa de dependências de código. */}
        <AstPanel open={astOpen} onClose={() => setAstOpen(false)} runId={activeRunId} />
        {/* Relatório e métricas de cobertura de código de testes. */}
        <CoveragePanel open={coverageOpen} onClose={() => setCoverageOpen(false)} runId={activeRunId} />
        {/* Exportador e gerador de ambientes Docker e devcontainer. */}
        <DockerPanel open={dockerOpen} onClose={() => setDockerOpen(false)} runId={activeRunId} />
        {/* Playground MCP (feature #5, V1 parcial) — drawer aberto pelo header. */}
        <Drawer open={mcpOpen} title="MCP Playground" onClose={() => setMcpOpen(false)}>
          <McpPlayground />
        </Drawer>
        {/* Memória (lessons engine): busca/cria/remove lições aprendidas. */}
        <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
        {/* Evals (5º pilar BLUEPRINT): resumo de runs/benchmarks + leaderboard. */}
        <EvalsPanel open={evalsOpen} onClose={() => setEvalsOpen(false)} />
        {/* Git (Tier2): branch/status/log da run ativa (query só com runId). */}
        <GitPanel open={gitOpen} onClose={() => setGitOpen(false)} runId={activeRunId ?? ''} />
        {/* Health (Tier2): polling /health 10s + status telemetria. */}
        <HealthPanel open={healthOpen} onClose={() => setHealthOpen(false)} />
        {/* Prompts (Tier2): overrides de prompt por persona (get_effective_prompt). */}
        <PromptPanel open={promptsOpen} onClose={() => setPromptsOpen(false)} />
        {/* Settings (Fase D/E9): budget/HITL/providers/toggles MCP. */}
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {/* Gate de API key (B2/M-20): overlay em 401/sem key; dispensável p/ demo. */}
        <ApiKeyGate />
        {/* Notificações flutuantes globais (toasts). */}
        <ToastContainer />
      </main>
    </QueryClientProvider>
  )
}
