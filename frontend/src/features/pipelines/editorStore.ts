import { create } from 'zustand'
import type { PipelineInput, PipelineNodeType, PipelineEdgeType } from '../../shared/lib/types'
import { GRID } from './editorModel'

// Store do editor de pipelines (S3 T9): draft + modo live/edição + mutators.
// live=true renderiza o DAG de execução atual (buildNodes/buildEdges, 1:1);
// live=false renderiza o draft via editorModel com a paleta. Draft é
// PipelineInput (contrato backend); `positions` guarda drags do canvas
// (PipelineInput não persiste geometria — posições são locais do editor).
interface EditorState {
  open: boolean
  editingId: string | null
  draft: PipelineInput | null
  live: boolean
  /** Edge selecionada no modo edição (abre o EdgeConfigDrawer). */
  selectedEdgeId: string | null
  /** Posições de drag por node id (overrides do layout em grade). */
  positions: Record<string, { x: number; y: number }>
  openPipeline: (id: string, pipeline: PipelineInput) => void
  newPipeline: () => void
  close: () => void
  setLive: (live: boolean) => void
  setSelectedEdgeId: (id: string | null) => void
  setPosition: (id: string, pos: { x: number; y: number }) => void
  addNode: (type: PipelineNodeType, agentId?: string | null) => void
  removeNode: (id: string) => void
  addEdge: (source: string, target: string) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, patch: Partial<{ type: PipelineEdgeType; condition: string | null; max_retries: number }>) => void
}

const EMPTY_DRAFT: PipelineInput = { name: '', description: '', nodes: [], edges: [] }

// Id único de nó do editor: `n{seq}` (seq global do store) — sem uuid/emoji.
let seq = 0

export const useEditorStore = create<EditorState>((set, get) => ({
  open: false,
  editingId: null,
  draft: null,
  live: true,
  selectedEdgeId: null,
  positions: {},

  openPipeline: (id, pipeline) =>
    set({ open: true, editingId: id, draft: pipeline, live: false, selectedEdgeId: null, positions: {} }),

  newPipeline: () =>
    set({ open: true, editingId: null, draft: { ...EMPTY_DRAFT }, live: false, selectedEdgeId: null, positions: {} }),

  close: () => set({ open: false, editingId: null, draft: null, live: true, selectedEdgeId: null, positions: {} }),

  setLive: (live) => set({ live, selectedEdgeId: null }),

  setSelectedEdgeId: (selectedEdgeId) => set({ selectedEdgeId }),

  setPosition: (id, pos) => set((s) => ({ positions: { ...s.positions, [id]: pos } })),

  addNode: (type, agentId = null) => {
    const draft = get().draft
    if (!draft) return
    seq += 1
    const id = `n${seq}`
    const i = draft.nodes.length
    set((s) => ({
      draft: {
        ...draft,
        nodes: [...draft.nodes, { id, type, agent_id: agentId, config: {} }],
      },
      positions: {
        ...s.positions,
        [id]: { x: (i % GRID.cols) * GRID.dx, y: Math.floor(i / GRID.cols) * GRID.dy },
      },
    }))
  },

  removeNode: (id) => {
    const draft = get().draft
    if (!draft) return
    set((s) => {
      const positions = { ...s.positions }
      delete positions[id]
      return {
        draft: {
          ...draft,
          nodes: draft.nodes.filter((n) => n.id !== id),
          edges: draft.edges.filter((e) => e.source !== id && e.target !== id),
        },
        positions,
      }
    })
  },

  addEdge: (source, target) => {
    const draft = get().draft
    if (!draft) return
    if (draft.edges.some((e) => e.source === source && e.target === target)) return
    set({
      draft: {
        ...draft,
        edges: [...draft.edges, { source, target, type: 'sequential', condition: null, max_retries: 0 }],
      },
    })
  },

  removeEdge: (id) => {
    const draft = get().draft
    if (!draft) return
    set({
      draft: { ...draft, edges: draft.edges.filter((e) => `${e.source}->${e.target}` !== id) },
      selectedEdgeId: null,
    })
  },

  updateEdge: (id, patch) => {
    const draft = get().draft
    if (!draft) return
    set({
      draft: {
        ...draft,
        edges: draft.edges.map((e) => (`${e.source}->${e.target}` === id ? { ...e, ...patch } : e)),
      },
    })
  },
}))
