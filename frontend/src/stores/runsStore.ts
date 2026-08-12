import { create } from 'zustand'
import type { Run, RunStatus } from '../shared/lib/types'

// Store de runs + fila (E3) + undo/redo (Ctrl+Z / Ctrl+Shift+Z).
// E3 (paralelismo real): o server executa N runs simultâneas e publica o status
// `queued` via WS — a fila aqui é DERIVADA dos status (fonte da verdade = server),
// não mantida manualmente. enqueue/dequeue permanecem para compat (demo mock) e
// para a UX legada, mas a re-derivação em cada mutação se auto-corrige.
// Undo/Redo opera sobre snapshots de `runs` (past/future, limite 50);
// snapshots são criados em addRun/upsertRun/removeRun (não em setRuns).
const UNDO_LIMIT = 50

interface RunsState {
  runs: Run[]
  activeRunId: string | null
  queue: string[]
  past: Run[][]
  future: Run[][]
  setRuns: (runs: Run[]) => void
  upsertRun: (run: Partial<Run> & { id: string }) => void
  addRun: (run: Partial<Run> & { id: string }) => void
  removeRun: (id: string) => void
  selectRun: (id: string | null) => void
  updateStatus: (id: string, status: RunStatus, current_node?: string | null) => void
  enqueue: (id: string) => void
  dequeue: () => void
  undo: () => void
  redo: () => void
}

export const useRunsStore = create<RunsState>((set) => ({
  runs: [],
  activeRunId: null,
  queue: [],
  past: [],
  future: [],

  setRuns: (runs) => set({ runs, queue: syncQueue(runs), future: [] }),

  upsertRun: (run: Partial<Run> & { id: string }) =>
    set((s) => {
      // Merge preserva campos existentes quando o patch omite (ex.: run_updated
      // sem idea/stack). Campos undefined são descartados.
      const clean = defined(run) as Partial<Run>
      const exists = s.runs.some((r) => r.id === run.id)
      const next = exists
        ? s.runs.map((r) => (r.id === run.id ? { ...r, ...clean } : r))
        : [...s.runs, { idea: '', stack: '', ...clean } as Run]
      return pushSnapshot(s, next)
    }),

  addRun: (run: Partial<Run> & { id: string }) =>
    set((s) => {
      if (s.runs.some((r) => r.id === run.id)) return s
      return pushSnapshot(s, [...s.runs, { idea: '', stack: '', ...defined(run) } as Run])
    }),

  removeRun: (id) =>
    set((s) => pushSnapshot(s, s.runs.filter((r) => r.id !== id))),

  selectRun: (id) => set({ activeRunId: id }),

  updateStatus: (id, status, current_node) =>
    set((s) => {
      const runs = s.runs.map((r) =>
        r.id === id ? { ...r, status, current_node: current_node ?? r.current_node } : r,
      )
      return { runs, queue: syncQueue(runs) }
    }),

  // Fila (E3) — mecanismo legado/UX: no paralelismo real o server publica o
  // status `queued` via WS e a fila é re-derivada. Estas ações seguem para o
  // demo mock e compatibilidade: sem ativa → o id vira ativo; com ativa →
  // vai para o fim da fila (sem duplicar).
  enqueue: (id) =>
    set((s) => {
      if (s.activeRunId === id) return s
      if (s.activeRunId === null) return { activeRunId: id }
      if (s.queue.includes(id)) return s
      return { queue: [...s.queue, id] }
    }),

  dequeue: () =>
    set((s) => {
      if (s.queue.length === 0) return { activeRunId: null }
      const [next, ...rest] = s.queue
      return { activeRunId: next, queue: rest }
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s
      const previous = s.past[s.past.length - 1]
      return {
        runs: previous,
        queue: syncQueue(previous),
        past: s.past.slice(0, -1),
        future: [...s.future, s.runs],
      }
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s
      const next = s.future[s.future.length - 1]
      return {
        runs: next,
        queue: syncQueue(next),
        future: s.future.slice(0, -1),
        past: pushSnapshotList(s.past, s.runs),
      }
    }),
}))

// Empurra o snapshot atual de runs para `past` (limite 50) e limpa `future`.
function pushSnapshot(s: RunsState, runs: Run[]) {
  return {
    runs,
    queue: syncQueue(runs),
    past: pushSnapshotList(s.past, s.runs),
    future: [],
  }
}

function pushSnapshotList(past: Run[][], runs: Run[]): Run[][] {
  const next = [...past, runs]
  if (next.length > UNDO_LIMIT) next.shift()
  return next
}

// E3: fila derivada do status `queued` (fonte da verdade = server via WS).
function syncQueue(runs: Run[]): string[] {
  return runs.filter((r) => r.status === 'queued').map((r) => r.id)
}

// Descarta campos com valor undefined (para merge preservar o existente).
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}
