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

// Buffer de streaming token a token (V1.1/ADR-0007): texto acumulado por nó
// enquanto o LLM gera. `content` é a concatenação dos chunks INCREMENTAIS;
// `finishStream` promove o buffer a entrada de log quando o nó conclui.
export interface ConsoleStream {
  node: NodeType | 'system'
  content: string
  runId?: string
  ts: number
}

interface ConsoleState {
  entries: ConsoleEntry[]
  streams: Record<string, ConsoleStream>
  filters: ConsoleFilters
  autoScroll: boolean
  addEntry: (e: ConsoleEntry) => void
  appendStream: (node: NodeType | 'system', content: string, runId?: string) => void
  finishStream: (node: NodeType | 'system') => void
  setFilters: (partial: Partial<ConsoleFilters>) => void
  toggleAutoScroll: () => void
  clear: () => void
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  entries: [],
  streams: {},
  filters: { node: 'all', level: 'all', query: '' },
  autoScroll: true,

  addEntry: (e) => set((s) => ({ entries: [...s.entries, e] })),

  // Streaming (V1.1/ADR-0007): acumula o chunk incremental no buffer do nó.
  appendStream: (node, content, runId) =>
    set((s) => {
      const prev = s.streams[node]
      return {
        streams: {
          ...s.streams,
          [node]: {
            node,
            content: (prev?.content ?? '') + content,
            runId: runId ?? prev?.runId,
            ts: Date.now(),
          },
        },
      }
    }),

  // Conclui o stream do nó: promove o buffer a log info e limpa o buffer
  // (no-op quando não há buffer ativo para o nó).
  finishStream: (node) =>
    set((s) => {
      const buf = s.streams[node]
      if (!buf) return {}
      const entry: ConsoleEntry = {
        id: `stream-${node}-${Date.now()}`,
        ts: buf.ts,
        runId: buf.runId,
        node,
        level: 'info',
        message: buf.content,
      }
      const streams = { ...s.streams }
      delete streams[node]
      return { streams, entries: [...s.entries, entry] }
    }),

  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),

  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),

  clear: () => set({ entries: [], streams: {} }),
}))
