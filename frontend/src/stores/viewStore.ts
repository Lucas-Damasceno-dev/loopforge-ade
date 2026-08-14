import { create } from 'zustand'
import type { ViewKey } from '../shared/lib/views'

// ─── viewStore (T2) ───────────────────────────────────────────────────────
// View ativa do shell: substitui os 13 useState de views do App e alimenta o
// ActivityRail (ativo) + drawers/painéis (open derivado no App). Semântica:
// openView(ativa) fecha (null); openView(nova) troca; closeView() zera.
// O conteúdo do painel entra na T3 (SidebarHost).

interface ViewState {
  activeView: ViewKey | null
  openView: (v: ViewKey) => void
  closeView: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  activeView: null,
  openView: (v) => set((s) => ({ activeView: s.activeView === v ? null : v })),
  closeView: () => set({ activeView: null }),
}))
