import { useQuery } from '@tanstack/react-query'
import { getRunQueue } from '../../shared/lib/api'
import type { RunQueueResponse } from '../../shared/lib/types'

// Badge de fila E3 (header do RunsWorkspace): ativos/máximo + quantos esperando.
// Polling 5s. Endpoint pode não existir em engine antigo → falha silenciosa
// (não renderiza nada — degradação graciosa, sem poluir o header).
export function QueueBadge() {
  const { data } = useQuery<RunQueueResponse>({
    queryKey: ['run-queue'],
    queryFn: getRunQueue,
    refetchInterval: 5000,
    retry: false,
  })

  if (!data) return null
  const { active_count, max_concurrent, queued } = data
  return (
    <span
      data-testid="queue-badge"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5 text-(--text-2xs) uppercase tracking-wide text-[var(--text-dim)]"
    >
      Queue: {active_count}/{max_concurrent} · {queued.length} waiting
    </span>
  )
}
