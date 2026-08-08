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
import { ApiKeyGate } from '../features/auth/ApiKeyGate'
import { Drawer } from '../shared/ui/Drawer'
import { Topbar } from '../shared/ui/Topbar'
import { useWsStore } from '../stores/wsStore'

const queryClient = new QueryClient()

// Layout completo: QueryClientProvider + topbar + workspace de runs.
// Conecta o WS uma única vez (guard ref p/ StrictMode double-effect).
export function App() {
  const connected = useRef(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [trajectoriesOpen, setTrajectoriesOpen] = useState(false)
  // Fullscreen do canvas (01b §6.1): F11 alterna; oculta topbar + chrome das
  // runs — restam canvas e console. Indicador discreto no canto do canvas.
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (connected.current) return
    connected.current = true
    useWsStore.getState().connect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        setFullscreen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <main data-testid="app-root" className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        {!fullscreen && (
          <Topbar
            right={
              <>
                {/* UX12: barra de orçamento global sempre visível. */}
                <CostBar className="w-44" />
                {/* Fase C: tela de trajetórias (fork/export/import/timeline). */}
                <button
                  type="button"
                  onClick={() => setTrajectoriesOpen(true)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-dim)] transition-colors duration-100 hover:bg-[var(--bg-elev)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Trajetórias
                </button>
                <button
                  type="button"
                  onClick={() => setMcpOpen(true)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-dim)] transition-colors duration-100 hover:bg-[var(--bg-elev)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  MCP playground
                </button>
              </>
            }
          />
        )}
        {/* Banner de gate HITL (C3/M-12): informativo, descartável, não-bloqueante. */}
        {!fullscreen && <HitlGateBanner />}
        <div className="relative min-h-0 flex-1">
          <RunsWorkspace hideChrome={fullscreen} />
          {/* Indicador de saída do fullscreen (01b §6.1). */}
          {fullscreen && (
            <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-[var(--bg-elev)] px-2 py-1 text-xs text-[var(--text-dim)] shadow-[var(--shadow-xs)]">
              Press F11 to exit fullscreen
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
        {/* Gate de API key (B2/M-20): overlay em 401/sem key; dispensável p/ demo. */}
        <ApiKeyGate />
      </main>
    </QueryClientProvider>
  )
}
