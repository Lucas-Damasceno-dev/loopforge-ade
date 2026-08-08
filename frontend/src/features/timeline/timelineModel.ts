import type { NodeType } from '../../shared/lib/types'
import type { NodeStatus, NodeStatusEntry } from '../../stores/canvasStore'

// Modelo puro do timeline (testável). O slider de time-travel (UX5) deriva
// seus steps do canvasStore.nodeStatus: nós com status ≠ 'pending' na ordem
// do pipeline. `index` = posição no `order` (equivale ao índice de ghosting
// que o buildNodes da T6 usa para apagar nós futuros).
export interface TimelineStep {
  index: number
  node: NodeType
  status: NodeStatus
}

export function deriveSteps(
  statuses: Partial<Record<NodeType, NodeStatusEntry>>,
  order: NodeType[],
): TimelineStep[] {
  const steps: TimelineStep[] = []
  order.forEach((node, index) => {
    const entry = statuses[node]
    if (entry && entry.status !== 'pending') steps.push({ index, node, status: entry.status })
  })
  return steps
}

// Mapeia a posição do slider para ghostToStep do canvas (clamped aos steps).
// null = live (sem inspeção).
export function ghostState(step: number | null, steps: TimelineStep[]): { ghostToStep: number | null } {
  if (step === null) return { ghostToStep: null }
  return { ghostToStep: Math.max(0, Math.min(step, steps.length)) }
}
