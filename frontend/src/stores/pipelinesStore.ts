import { create } from 'zustand'
import type { Pipeline, PipelineInput, ValidateResult } from '../shared/lib/types'
import {
  ApiError,
  listPipelines,
  createPipeline as createPipelineApi,
  updatePipeline as updatePipelineApi,
  deletePipeline as deletePipelineApi,
  validatePipeline as validatePipelineApi,
} from '../shared/lib/api'

// Store de pipelines (S3): lista + CRUD + validação via API. Mutação local
// após sucesso (sem refetch) — padrão agentsStore (S2). Correções herdadas do
// carry-over S2: delete com short-circuit (id inexistente localmente = no-op
// sem chamar a API) e 404-swallow que LIMPA error stale (bug do agentsStore:
// 404 setava estado desejado mas deixava error pré-existente na tela).
interface PipelinesState {
  pipelines: Pipeline[]
  loading: boolean
  error: string | null
  fetchPipelines: () => Promise<void>
  createPipeline: (input: PipelineInput) => Promise<Pipeline>
  updatePipeline: (id: string, input: Partial<PipelineInput>) => Promise<Pipeline>
  deletePipeline: (id: string) => Promise<void>
  validatePipeline: (id: string) => Promise<ValidateResult | null>
}

export const usePipelinesStore = create<PipelinesState>((set, get) => ({
  pipelines: [],
  loading: false,
  error: null,

  fetchPipelines: async () => {
    set({ loading: true, error: null })
    try {
      const pipelines = await listPipelines()
      set({ pipelines, loading: false })
    } catch (e) {
      console.error('Failed to load pipelines:', e)
      set({ loading: false, error: 'Failed to load pipelines' })
    }
  },

  createPipeline: async (input) => {
    try {
      const pipeline = await createPipelineApi(input)
      set((s) => ({ pipelines: [...s.pipelines, pipeline], error: null }))
      return pipeline
    } catch (e) {
      set({ error: pipelineErrorMessage(e, 'save') })
      throw e
    }
  },

  updatePipeline: async (id, input) => {
    try {
      const pipeline = await updatePipelineApi(id, input)
      set((s) => ({ pipelines: s.pipelines.map((p) => (p.id === id ? pipeline : p)), error: null }))
      return pipeline
    } catch (e) {
      set({ error: pipelineErrorMessage(e, 'save') })
      throw e
    }
  },

  deletePipeline: async (id) => {
    // Short-circuit: id inexistente localmente (lista vazia inclusa) = no-op
    // sem chamar a API — o estado já é o desejado.
    if (!get().pipelines.some((p) => p.id === id)) return
    try {
      await deletePipelineApi(id)
      set((s) => ({ pipelines: s.pipelines.filter((p) => p.id !== id), error: null }))
    } catch (e) {
      // 404: recurso já inexistente — estado desejado; remove da lista E limpa
      // error (fix minor S2: 404-swallow não pode deixar error stale na tela).
      if (e instanceof ApiError && e.status === 404) {
        set((s) => ({ pipelines: s.pipelines.filter((p) => p.id !== id), error: null }))
        return
      }
      set({ error: pipelineErrorMessage(e, 'delete') })
      throw e
    }
  },

  validatePipeline: async (id) => {
    try {
      const result = await validatePipelineApi(id)
      set({ error: null })
      return result
    } catch (e) {
      // Não re-throw: o painel/editor mostra errors inline via retorno null.
      set({ error: pipelineErrorMessage(e, 'validate') })
      return null
    }
  },
}))

// Mensagem EN amigável por status — padrão SettingsPanel/agentsStore: 422
// pydantic → genérica + detail no console; outros HTTP → "Failed to ...";
// sem ApiError → mensagem do Error quando existir.
function pipelineErrorMessage(e: unknown, kind: 'save' | 'delete' | 'validate'): string {
  if (e instanceof ApiError) {
    const detail = e.detail
    if (Array.isArray(detail)) {
      console.error(`Pipeline ${kind} rejected by API:`, detail)
      return `The server rejected the pipeline (HTTP ${e.status})`
    }
    if (typeof detail === 'string' && detail.trim().length > 0) {
      console.error(`Pipeline ${kind} rejected by API:`, detail)
    }
    return `Failed to ${kind} pipeline (HTTP ${e.status})`
  }
  return e instanceof Error && e.message ? e.message : `Failed to ${kind} pipeline`
}
