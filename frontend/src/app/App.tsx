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
import { ApiKeyGate } from '../features/auth/ApiKeyGate'
import { Drawer } from '../shared/ui/Drawer'
import { Topbar, TopbarAction } from '../shared/ui/Topbar'
import { Button } from '../shared/ui/Button'
import { useWsStore } from '../stores/wsStore'
import { useRunsStore } from '../stores/runsStore'
import { useCanvasStore } from '../stores/canvasStore'

const queryClient = new QueryClient()

// Layout completo: QueryClientProvider + topbar + workspace de runs.
// Conecta o WS uma única vez (guard ref p/ StrictMode double-effect).
export function App() {
  const connected = useRef(false)
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
  // Estado do canvas p/ política de drawers sobrepostos (P2): fechar o
  // Inspect quando a run pausa (HITL abre).
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)

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

  return (
    <QueryClientProvider client={queryClient}>
      <main data-testid="app-root" className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        {!fullscreen && (
          <Topbar
            right={
              <>
                {/* UX12: badge de orçamento global sempre visível. */}
                <CostBar />
                {/* Navegação segmented (auditoria Lane B): abre painéis/drawers. */}
                <nav
                  aria-label="Workspace views"
                  className="flex items-center gap-0.5 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-elev)] p-0.5"
                >
                  {/* Fase C: tela de trajetórias (fork/export/import/timeline). */}
                  <TopbarAction label="Trajectories" icon="trajectories" active={trajectoriesOpen} onClick={() => setTrajectoriesOpen(true)} />
                  <TopbarAction label="MCP playground" icon="mcp" active={mcpOpen} onClick={() => setMcpOpen(true)} />
                  <TopbarAction label="Memory" icon="memory" active={memoryOpen} onClick={() => setMemoryOpen(true)} />
                  <TopbarAction label="Evals" icon="evals" active={evalsOpen} onClick={() => setEvalsOpen(true)} />
                  {/* Fase D (E9): configuração da engine (budget/HITL/providers/MCP). */}
                  <TopbarAction label="Git" icon="git" active={gitOpen} onClick={() => setGitOpen(true)} />
                  <TopbarAction label="Health" icon="health" active={healthOpen} onClick={() => setHealthOpen(true)} />
                  <TopbarAction label="Prompts" icon="prompts" active={promptsOpen} onClick={() => setPromptsOpen(true)} />
                  <TopbarAction label="Settings" icon="settings" active={settingsOpen} onClick={() => setSettingsOpen(true)} />
                </nav>
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
        {/* Área canvas — border-b delimita do timeline/console (auditoria). */}
        <div className="relative min-h-0 flex-1 border-b border-[var(--border)]">
          <RunsWorkspace hideChrome={fullscreen} />
          {/* Indicador de saída do Focus mode (01b §6.1) — Esc sai nativo. */}
          {fullscreen && (
            <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-[var(--bg-elev)] px-2 py-1 text-xs text-[var(--text-dim)] shadow-[var(--shadow-xs)]">
              Press Esc to exit fullscreen
            </div>
          )}
        </div>
        {/* Timeline (UX5/UX6): slider de time-travel entre canvas e console. */}
        <TimelineBar />
        <ConsolePanel className="h-60 shrink-0" />
        {/* Drawer de inspeção (portal p/ body) — abre com nó selecionado no canvas. */}
        <InspectDrawer />
        {/* Drawer HITL (portal p/ body) — complementar: abre com nó paused. */}
        <HitlDrawer />
        {/* Trajetórias (Fase C): fork/export/import/timeline por run. */}
        <TrajectoriesPanel open={trajectoriesOpen} onClose={() => setTrajectoriesOpen(false)} />
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
      </main>
    </QueryClientProvider>
  )
}
