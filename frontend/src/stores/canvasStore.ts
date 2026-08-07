import { create } from 'zustand'
import type { NodeType } from '../shared/lib/types'

// Estado do canvas (kanban/graph): status por nó + seleção + ghost step.
// NodeStatus reflete o estado do NÓ no kanban (não da run).
export type NodeStatus = 'pending' | 'running' | 'approved' | 'rejected' | 'paused'

export interface NodeStatusEntry {
  status: NodeStatus
  attemptCount: number
}

interface CanvasState {
  mode: 'kanban' | 'graph'
  setMode: (m: 'kanban' | 'graph') => void
  selectedNodeId: string | null
  selectNode: (id: string | null) => void
  nodeStatus: Partial<Record<NodeType, NodeStatusEntry>>
  setNodeStatus: (node: NodeType, status: NodeStatus, attemptCount?: number) => void
  resetNodes: () => void
  ghostToStep: number | null
  setGhostToStep: (n: number | null) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  mode: 'kanban',
  selectedNodeId: null,
  nodeStatus: {},
  ghostToStep: null,

  setMode: (mode) => set({ mode }),

  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  setNodeStatus: (node, status, attemptCount) =>
    set((s) => {
      const prev = s.nodeStatus[node]
      return {
        nodeStatus: {
          ...s.nodeStatus,
          [node]: { status, attemptCount: attemptCount ?? prev?.attemptCount ?? 0 },
        },
      }
    }),

  resetNodes: () => set({ nodeStatus: {} }),

  setGhostToStep: (ghostToStep) => set({ ghostToStep }),
}))
