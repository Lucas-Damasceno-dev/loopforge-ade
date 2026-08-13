import { create } from 'zustand'

// Estado de abertura do modal de budget override — compartilhado entre o
// CostBar (dono do modal) e o banner de run pausada (RunsWorkspace).
// runId guarda qual run o modal deve operar quando aberto pelo banner.
interface BudgetOverrideState {
  open: boolean
  runId: string | null
  openOverride: (runId: string) => void
  closeOverride: () => void
}

export const useBudgetOverrideStore = create<BudgetOverrideState>((set) => ({
  open: false,
  runId: null,
  openOverride: (runId) => set({ open: true, runId }),
  closeOverride: () => set({ open: false, runId: null }),
}))
