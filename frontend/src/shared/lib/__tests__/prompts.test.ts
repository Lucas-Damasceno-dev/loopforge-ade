import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePrompt, listPrompts, savePrompt } from '../prompts'
import { apiFetch } from '../api'

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}))

const mockedFetch = vi.mocked(apiFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('prompts lib', () => {
  it('listPrompts hits /prompts and returns effective prompts', async () => {
    const body = [{ node: 'cpo', prompt: 'Você é um CPO…' }]
    mockedFetch.mockResolvedValue(body)
    const res = await listPrompts()
    expect(mockedFetch).toHaveBeenCalledWith('/prompts')
    expect(res).toEqual(body)
  })

  it('savePrompt PATCHes /prompts/{node} with the prompt body', async () => {
    const entry = { node: 'cpo', prompt: 'Novo prompt do CPO.' }
    mockedFetch.mockResolvedValue(entry)
    const res = await savePrompt('cpo', 'Novo prompt do CPO.')
    expect(mockedFetch).toHaveBeenCalledWith('/prompts/cpo', {
      method: 'PATCH',
      body: JSON.stringify({ prompt: 'Novo prompt do CPO.' }),
    })
    expect(res).toEqual(entry)
  })

  it('savePrompt URL-encodes the node name', async () => {
    mockedFetch.mockResolvedValue({ node: 'tech_lead', prompt: 'x' })
    await savePrompt('tech_lead', 'x')
    expect(mockedFetch).toHaveBeenCalledWith('/prompts/tech_lead', expect.anything())
  })

  it('deletePrompt DELETEs /prompts/{node}', async () => {
    mockedFetch.mockResolvedValue({ deleted: true })
    const res = await deletePrompt('developer')
    expect(mockedFetch).toHaveBeenCalledWith('/prompts/developer', { method: 'DELETE' })
    expect(res).toEqual({ deleted: true })
  })

  it('propagates backend errors (404 unknown node)', async () => {
    mockedFetch.mockRejectedValue(new Error('API 404: Nó desconhecido'))
    await expect(deletePrompt('qa')).rejects.toThrow('API 404: Nó desconhecido')
  })
})
