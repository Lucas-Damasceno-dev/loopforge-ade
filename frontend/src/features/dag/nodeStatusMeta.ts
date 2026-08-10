import type { NodeStatus } from '../../stores/canvasStore'

// Vocabulário único de status de nó (tone de cor + rótulo), consumido pelo
// canvas (AgentNode) e pelo drawer de inspeção (InspectDrawer). Antes duplicado
// nos dois arquivos — centralizar aqui elimina o risco de drift entre eles.
export const NODE_STATUS_TONE: Record<NodeStatus, 'neutral' | 'accent' | 'ok' | 'err' | 'warn'> = {
  pending: 'neutral',
  running: 'accent',
  approved: 'ok',
  rejected: 'err',
  paused: 'warn',
}

export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  approved: 'Approved',
  rejected: 'Rejected',
  paused: 'Paused',
}
