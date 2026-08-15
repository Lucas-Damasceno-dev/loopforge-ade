import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewRunForm, STACK_OPTIONS, ROUTING_OPTIONS } from '../NewRunForm'
import { createRun, listPipelines, ApiError } from '../../../shared/lib/api'
import { usePipelinesStore } from '../../../stores/pipelinesStore'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../shared/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...actual,
    createRun: vi.fn(),
    listPipelines: vi.fn(),
  }
})

const queryClient = new QueryClient()

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <NewRunForm onCreated={vi.fn()} />
    </QueryClientProvider>,
  )
}

const pipeline = (over: Partial<{ id: string; name: string }> = {}) => ({
  id: over.id ?? 'p1',
  name: over.name ?? 'Main flow',
  description: 'd',
  nodes: [],
  edges: [],
  created_at: '2026-08-14T00:00:00',
  updated_at: '2026-08-14T00:00:00',
})

describe('NewRunForm', () => {
  beforeEach(() => {
    vi.mocked(createRun).mockReset()
    vi.mocked(createRun).mockResolvedValue({ id: 'r1', idea: 'x', stack: 'python', status: 'pending' })
    vi.mocked(listPipelines).mockReset()
    vi.mocked(listPipelines).mockResolvedValue([pipeline(), pipeline({ id: 'p2', name: 'Security audit' })])
    usePipelinesStore.setState({ pipelines: [], loading: false, error: null })
    useAuthStore.setState({ principal: null })
  })

  it('renders stack and routing_mode selects with backend options', () => {
    renderForm()
    const stack = screen.getByLabelText(/stack/i) as HTMLSelectElement
    const routing = screen.getByLabelText(/routing mode/i) as HTMLSelectElement
    expect(stack.options).toHaveLength(STACK_OPTIONS.length)
    expect(routing.options).toHaveLength(ROUTING_OPTIONS.length)
    expect(stack.value).toBe('python') // default
    expect(routing.value).toBe('full') // default
  })

  it('submits idea + selected stack/routing_mode to createRun', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/stack/i), { target: { value: 'go' } })
    fireEvent.change(screen.getByLabelText(/routing mode/i), { target: { value: 'fast' } })
    fireEvent.change(screen.getByLabelText(/idea/i), { target: { value: 'build a cli' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    // mutate dispara a mutationFn em microtask e react-query passa um 2º arg
    // (contexto do client) — valida apenas o payload (1º argumento).
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual({ idea: 'build a cli', stack: 'go', routing_mode: 'fast', interactive: true })
    })
  })

  it('does not submit empty idea', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    expect(createRun).not.toHaveBeenCalled()
  })

  it('omits model from the body when the field is empty (default do backend)', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/idea/i), { target: { value: 'build a cli' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual({ idea: 'build a cli', stack: 'python', routing_mode: 'full', interactive: true })
      expect(args?.[0]).not.toHaveProperty('model')
    })
  })

  it('sends model in the body when filled', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/idea/i), { target: { value: 'build a cli' } })
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'opencode-go/deepseek-v4-flash' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual({
        idea: 'build a cli',
        stack: 'python',
        routing_mode: 'full',
        interactive: true,
        model: 'opencode-go/deepseek-v4-flash',
      })
    })
  })

  it('pipeline select renderiza pipelines da biblioteca (opcional)', async () => {
    renderForm()
    const select = await screen.findByLabelText(/pipeline/i)
    expect(select).toBeInTheDocument()
    expect(vi.mocked(listPipelines)).toHaveBeenCalled()
    const opts = [...(select as HTMLSelectElement).options].map((o) => o.textContent)
    expect(opts).toEqual(expect.arrayContaining(['Main flow', 'Security audit']))
    // Sem seleção → default vazio (fallback automático).
    expect((select as HTMLSelectElement).value).toBe('')
  })

  it('sem seleção de pipeline → createRun sem pipeline_id (fallback automático)', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/idea/i), { target: { value: 'build a cli' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual({ idea: 'build a cli', stack: 'python', routing_mode: 'full', interactive: true })
      expect(args?.[0]).not.toHaveProperty('pipeline_id')
    })
  })

  it('com seleção de pipeline → modal de snapshot e pipeline_id no payload', async () => {
    renderForm()
    const select = await screen.findByLabelText(/pipeline/i)
    fireEvent.change(select, { target: { value: 'p2' } })
    fireEvent.change(screen.getByLabelText(/idea/i), { target: { value: 'build a cli' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    // S3: pipeline selecionado → Run abre o preview do snapshot (não cria direto)
    expect(await screen.findByText(/Snapshot do pipeline/i)).toBeTruthy()
    fireEvent.click(screen.getByText('Criar run'))
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual({
        idea: 'build a cli',
        stack: 'python',
        routing_mode: 'full',
        interactive: true,
        pipeline_id: 'p2',
        snapshot: expect.objectContaining({ name: 'Security audit', description: 'd' }),
      })
    })
  })

  it('com pipeline selecionado, Run abre modal de snapshot; confirmar envia snapshot', async () => {
    usePipelinesStore.setState({
      pipelines: [
        {
          id: 'p1',
          name: 'SnapPipe',
          description: 'desc original',
          nodes: [{ id: 'n1', type: 'agent', agent_id: null, config: {} }],
          edges: [],
          created_at: '',
          updated_at: '',
        },
      ],
    })
    renderForm()
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: 'minha ideia' } })
    fireEvent.change(screen.getByLabelText('Pipeline (optional)'), { target: { value: 'p1' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    // Modal de snapshot aparece
    expect(await screen.findByText(/Snapshot do pipeline/i)).toBeTruthy()
    // Edita a descrição e confirma
    const desc = screen.getByLabelText('Descrição do snapshot')
    fireEvent.change(desc, { target: { value: 'desc editada' } })
    fireEvent.click(screen.getByText('Criar run'))
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual(
        expect.objectContaining({
          idea: 'minha ideia',
          pipeline_id: 'p1',
          snapshot: expect.objectContaining({ description: 'desc editada', name: 'SnapPipe' }),
        }),
      )
    })
  })

  it('sem pipeline selecionado, Run envia direto (sem modal, sem snapshot)', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: 'direta' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() => {
      const args = vi.mocked(createRun).mock.calls[0]
      expect(args?.[0]).toEqual(
        expect.not.objectContaining({ snapshot: expect.anything() }),
      )
    })
  })

  it('falha 422 mostra o detail real do ApiError (não mensagem genérica)', async () => {
    vi.mocked(createRun).mockRejectedValue(new ApiError(422, 'idea must be at least 10 characters'))
    renderForm()
    fireEvent.change(screen.getByLabelText(/idea/i), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('idea must be at least 10 characters')
    expect(alert).not.toHaveTextContent('Failed to start run')
  })

  it('viewer não vê o formulário (read-only notice)', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    renderForm()
    expect(screen.queryByLabelText('Idea')).toBeNull()
    expect(screen.getByText(/read-only/i)).toBeTruthy()
  })
})
