import type { RunStatus } from './types'
import type { BadgeProps } from '../ui/Badge'

// Fonte única de status de RUN (S1 carry-over — era duplicado em RunTabs,
// RunInspector, TrajectoriesPanel, SidebarHost). NÃO confundir com
// NODE_STATUS_TONE (nodeStatusMeta.ts): aqui é status de RUN
// (pending/queued/running/paused/completed/failed), lá é status de NÓ.
// Badge.tsx não importa nada de lib — sem ciclo.

// Tone do Badge por status de RUN (vocabulário completo do Badge).
export const RUN_STATUS_TONE: Record<RunStatus, BadgeProps['tone']> = {
  pending: 'neutral',
  queued: 'info',
  running: 'accent',
  paused: 'warn',
  completed: 'ok',
  failed: 'err',
}

// RunsSummary (SidebarHost) usa vocabulário REDUZIDO (sem neutral/info):
// ok para running/completed, accent para queued/pending — visual do resumo
// compacto preservado (NÃO unificado com RUN_STATUS_TONE para não mudar UI).
export const RUN_SUMMARY_TONE: Record<RunStatus, BadgeProps['tone']> = {
  pending: 'accent',
  queued: 'accent',
  running: 'ok',
  paused: 'warn',
  completed: 'ok',
  failed: 'err',
}

/** Label EN capitalizado; status não-mapeados usam o valor cru. */
export function runStatusLabel(status: RunStatus): string {
  if (status === 'queued') return 'Queued'
  if (status === 'paused') return 'Paused'
  return status
}
