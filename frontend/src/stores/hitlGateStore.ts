import { create } from 'zustand'

// Gate HITL alcançado (C3/M-12): o evento WS hitl_gate_reached vira um
// banner informativo NÃO-bloqueante (HitlGateBanner). O store guarda os
// gates ainda não descartados, mais recente primeiro; o banner renderiza o
// topo da lista. Mesmo gate na mesma run re-emitido substitui (sem empilhar).

export interface HitlGateInfo {
  /** id único p/ descarte (gerado localmente). */
  id: string
  gateNode: string
  runId?: string
  threadId?: string
  timeoutSeconds?: number
  onTimeout?: string
  ts?: number
}

interface HitlGateState {
  gates: HitlGateInfo[]
  push: (g: Omit<HitlGateInfo, 'id'>) => void
  dismiss: (id: string) => void
  clear: () => void
}

let gateSeq = 0

export const useHitlGateStore = create<HitlGateState>((set) => ({
  gates: [],
  push: (g) =>
    set((s) => {
      const key = `${g.runId ?? ''}:${g.gateNode}`
      const existing = s.gates.find((x) => `${x.runId ?? ''}:${x.gateNode}` === key)
      const entry: HitlGateInfo = { ...g, id: existing?.id ?? `gate-${++gateSeq}-${Date.now()}` }
      const rest = existing ? s.gates.filter((x) => x.id !== existing.id) : s.gates
      return { gates: [entry, ...rest] }
    }),
  dismiss: (id) => set((s) => ({ gates: s.gates.filter((g) => g.id !== id) })),
  clear: () => set({ gates: [] }),
}))
