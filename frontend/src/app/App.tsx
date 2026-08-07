import { useEffect, useRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunsWorkspace } from '../features/runs/RunsWorkspace'
import { useWsStore } from '../stores/wsStore'

const queryClient = new QueryClient()

// Layout completo: QueryClientProvider + header + workspace de runs.
// Conecta o WS uma única vez (guard ref p/ StrictMode double-effect).
export function App() {
  const connected = useRef(false)
  useEffect(() => {
    if (connected.current) return
    connected.current = true
    useWsStore.getState().connect()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <main data-testid="app-root" className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <header className="flex items-center border-b border-[var(--border)] px-4 py-2">
          <h1 className="text-sm font-semibold">LoopForge ADE</h1>
        </header>
        <div className="min-h-0 flex-1">
          <RunsWorkspace />
        </div>
      </main>
    </QueryClientProvider>
  )
}
