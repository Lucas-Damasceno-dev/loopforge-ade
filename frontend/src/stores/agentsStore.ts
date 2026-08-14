import { create } from 'zustand'
import type { Agent, AgentInput } from '../shared/lib/types'
import { ApiError, listAgents, createAgent as createAgentApi, updateAgent as updateAgentApi, deleteAgent as deleteAgentApi } from '../shared/lib/api'

// Store de agentes (S2): lista + CRUD via API. Fonte da verdade = servidor;
// create/update/delete mutam `agents` localmente após sucesso (sem refetch —
// a lista é pequena e o backend devolve o recurso completo). Erros de API
// viram mensagem EN amigável em `error`; o detail verbatim (pydantic pode ser
// array) vai só para o console.error — padrão SettingsPanel.
interface AgentsState {
  agents: Agent[]
  loading: boolean
  error: string | null
  fetchAgents: () => Promise<void>
  createAgent: (input: AgentInput) => Promise<Agent>
  updateAgent: (id: string, input: Partial<AgentInput>) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const agents = await listAgents()
      set({ agents, loading: false })
    } catch (e) {
      console.error('Failed to load agents:', e)
      set({ loading: false, error: 'Failed to load agents' })
    }
  },

  createAgent: async (input) => {
    try {
      const agent = await createAgentApi(input)
      set((s) => ({ agents: [...s.agents, agent], error: null }))
      return agent
    } catch (e) {
      set({ error: agentErrorMessage(e, 'save') })
      throw e
    }
  },

  updateAgent: async (id, input) => {
    try {
      const agent = await updateAgentApi(id, input)
      set((s) => ({
        agents: s.agents.map((a) => (a.id === id ? agent : a)),
        error: null,
      }))
      return agent
    } catch (e) {
      set({ error: agentErrorMessage(e, 'save') })
      throw e
    }
  },

  deleteAgent: async (id) => {
    // F1 (fix round 1): id inexistente localmente (lista vazia inclusa) =
    // no-op sem chamar a API — o estado já é o desejado.
    if (!get().agents.some((a) => a.id === id)) return
    try {
      await deleteAgentApi(id)
      set((s) => ({ agents: s.agents.filter((a) => a.id !== id), error: null }))
    } catch (e) {
      // 404: recurso já inexistente no servidor — estado desejado; remove da
      // lista (resposta de sucesso de quem já deletou) e engole (sem error,
      // sem re-throw — delete fire-and-forget na UI não gera unhandled).
      if (e instanceof ApiError && e.status === 404) {
        set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
        return
      }
      // Rede/500: mantém error amigável + re-throw (caller decide UX).
      set({ error: agentErrorMessage(e, 'delete') })
      throw e
    }
  },
}))

// Mensagem EN amigável por status: 422 pydantic → genérica + detail no
// console; outros HTTP → "Failed to ... (HTTP <status>)"; sem status →
// mensagem do Error quando existir.
function agentErrorMessage(e: unknown, kind: 'save' | 'delete'): string {
  if (e instanceof ApiError) {
    const detail = e.detail
    if (Array.isArray(detail)) {
      console.error(`Agent ${kind} rejected by API:`, detail)
      return `The server rejected the agent (HTTP ${e.status})`
    }
    if (typeof detail === 'string' && detail.trim().length > 0) {
      console.error(`Agent ${kind} rejected by API:`, detail)
    }
    return `Failed to ${kind} agent (HTTP ${e.status})`
  }
  return e instanceof Error && e.message ? e.message : `Failed to ${kind} agent`
}
