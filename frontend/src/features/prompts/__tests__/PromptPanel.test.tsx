import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PromptPanel } from '../PromptPanel'
import { deletePrompt, listPrompts, savePrompt } from '../../../shared/lib/prompts'
import type { PromptEntry } from '../../../shared/lib/prompts'

vi.mock('../../../shared/lib/prompts', () => ({
  listPrompts: vi.fn(),
  savePrompt: vi.fn(),
  deletePrompt: vi.fn(),
}))

const ENTRIES: PromptEntry[] = [
  { node: 'cpo', prompt: 'Você é um CPO (Chief Product Officer). Transforme a ideia abaixo em um épico estruturado.' },
  { node: 'developer', prompt: 'Você é um Desenvolvedor Sênior. Stack definida pelo Tech Lead.' },
]

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <PromptPanel open onClose={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PromptPanel (prompt central)', () => {
  it('loads and renders node prompts with friendly labels', async () => {
    vi.mocked(listPrompts).mockResolvedValue(ENTRIES)
    renderPanel()
    expect(await screen.findByText('CPO')).toBeInTheDocument()
    expect(screen.getByText('Developer')).toBeInTheDocument()
    expect(screen.getByText(/Você é um CPO/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit cpo prompt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset cpo prompt' })).toBeDisabled()
  })

  it('edits and saves an override via savePrompt(node, prompt)', async () => {
    vi.mocked(listPrompts).mockResolvedValue(ENTRIES)
    vi.mocked(savePrompt).mockResolvedValue({ node: 'cpo', prompt: 'Novo prompt.' })
    renderPanel()
    await screen.findByText('CPO')

    await userEvent.click(screen.getByRole('button', { name: 'Edit cpo prompt' }))
    const textarea = await screen.findByLabelText('cpo prompt text')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Novo prompt do CPO.')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(savePrompt).toHaveBeenCalledWith('cpo', 'Novo prompt do CPO.'))
    expect(await screen.findByRole('status')).toHaveTextContent('Prompt saved')
  })

  it('disables Save while the draft is empty', async () => {
    vi.mocked(listPrompts).mockResolvedValue(ENTRIES)
    renderPanel()
    await screen.findByText('CPO')
    await userEvent.click(screen.getByRole('button', { name: 'Edit cpo prompt' }))
    await screen.findByLabelText('cpo prompt text')
    await userEvent.clear(screen.getByLabelText('cpo prompt text'))
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('enables Reset after saving and resets via deletePrompt(node)', async () => {
    vi.mocked(listPrompts).mockResolvedValue(ENTRIES)
    vi.mocked(savePrompt).mockResolvedValue({ node: 'cpo', prompt: 'x' })
    vi.mocked(deletePrompt).mockResolvedValue({ deleted: true })
    renderPanel()
    await screen.findByText('CPO')

    // Salva um override → botão Reset do nó habilita.
    await userEvent.click(screen.getByRole('button', { name: 'Edit cpo prompt' }))
    await userEvent.clear(await screen.findByLabelText('cpo prompt text'))
    await userEvent.type(screen.getByLabelText('cpo prompt text'), 'Novo prompt.')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset cpo prompt' })).toBeEnabled())

    // Reset chama deletePrompt e desabilita de novo (volta ao default).
    await userEvent.click(screen.getByRole('button', { name: 'Reset cpo prompt' }))
    await waitFor(() => expect(deletePrompt).toHaveBeenCalledWith('cpo'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset cpo prompt' })).toBeDisabled())
  })

  it('shows backend detail on load error (role=alert)', async () => {
    vi.mocked(listPrompts).mockRejectedValue(
      Object.assign(new Error('x'), { status: 500, detail: 'Falha ao ler overrides' }),
    )
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao ler overrides')
  })
})
