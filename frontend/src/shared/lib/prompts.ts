import { apiFetch } from './api'

// ─── Prompt Central (PromptPanel) — overrides de prompts dos nós ─────────────
// CRUD em /api/v1/prompts (src/lf/api/prompts.py). GET lista o prompt EFETIVO
// de cada nó (override se houver, senão o default embutido do nó); PATCH salva
// override; DELETE remove override e volta ao default.

export interface PromptEntry {
  node: string
  prompt: string
}

export interface PromptOverridePayload {
  prompt: string
}

export interface PromptDeleteResult {
  deleted: boolean
}

/** Lista o prompt efetivo de cada nó (override ou default). */
export const listPrompts = () => apiFetch<PromptEntry[]>('/prompts')

/** Salva (ou sobrescreve) o override do prompt do nó. */
export const savePrompt = (node: string, prompt: string) =>
  apiFetch<PromptEntry>(`/prompts/${encodeURIComponent(node)}`, {
    method: 'PATCH',
    body: JSON.stringify({ prompt } satisfies PromptOverridePayload),
  })

/** Remove o override do prompt do nó (volta ao default). 404 se não existe. */
export const deletePrompt = (node: string) =>
  apiFetch<PromptDeleteResult>(`/prompts/${encodeURIComponent(node)}`, { method: 'DELETE' })
