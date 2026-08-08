import { create } from 'zustand'
import type { NodeType } from '../shared/lib/types'

// Log do console da ADE. Entradas são imutáveis; os filtros atuam na
// SELEÇÃO (selector), não na lista — as entradas ficam intactas (teste do
// brief: entries.length não muda ao setFilters).
export type LogLevel = 'info' | 'warn' | 'error'

export interface ConsoleEntry {
  id: string
  ts: number
  runId?: string
  node?: NodeType | 'system'
  level: LogLevel
  message: string
}

export interface ConsoleFilters {
  node: NodeType | 'all'
  level: LogLevel | 'all'
  query: string
}

interface ConsoleState {
  entries: ConsoleEntry[]
  filters: ConsoleFilters
  autoScroll: boolean
  addEntry: (e: ConsoleEntry) => void
  setFilters: (partial: Partial<ConsoleFilters>) => void
  toggleAutoScroll: () => void
  clear: () => void
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  entries: [],
  filters: { node: 'all', level: 'all', query: '' },
  autoScroll: true,

  addEntry: (e) => set((s) => ({ entries: [...s.entries, e] })),

  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),

  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),

  clear: () => set({ entries: [] }),
}))
