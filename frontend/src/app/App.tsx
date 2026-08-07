import { useEffect, useState } from 'react'
import { getConfig } from '../shared/lib/api'

// Placeholder de status do backend — removido quando o workspace de runs
// (features/runs) for implementado.
export function App() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'offline'>('checking')

  useEffect(() => {
    getConfig()
      .then(() => setStatus('connected'))
      .catch(() => setStatus('offline'))
  }, [])

  return (
    <main data-testid="app-root">
      <h1>LoopForge ADE</h1>
      <p className="text-sm text-[var(--text-dim)]">Backend: {status}</p>
    </main>
  )
}
