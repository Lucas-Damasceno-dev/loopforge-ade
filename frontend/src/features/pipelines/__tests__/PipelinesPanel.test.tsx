import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipelinesPanel } from '../PipelinesPanel'
import { usePipelinesStore } from '../../../stores/pipelinesStore'
import { listPipelines, createPipeline, updatePipeline, deletePipeline, ApiError } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...mod,
    listPipelines: vi.fn(),
    createPipeline: vi.fn(),
    updatePipeline: vi.fn(),
    deletePipeline: vi.fn(),
  }
})

const pipeline = {
  id: 'p1',
  name: 'CI Pipeline',
  description: 'Build and test the workspace.',
  nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
  edges: [{ id: 'e1' }, { id: 'e2' }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  usePipelinesStore.setState({ pipelines: [], loading: false, error: null })
  vi.mocked(listPipelines).mockResolvedValue([])
  vi.mocked(createPipeline).mockReset()
  vi.mocked(updatePipeline).mockReset()
  vi.mocked(deletePipeline).mockReset()
})

describe('PipelinesPanel', () => {
  it('lista renderiza pipelines (name, counts de nodes/edges, desc)', async () => {
    vi.mocked(listPipelines).mockResolvedValue([pipeline] as never)
    render(<PipelinesPanel />)
    expect(await screen.findByText('CI Pipeline')).toBeInTheDocument()
    expect(screen.getByText('3 nodes')).toBeInTheDocument()
    expect(screen.getByText('2 edges')).toBeInTheDocument()
    expect(screen.getByText(/build and test/i)).toBeInTheDocument()
  })

  it('vazio → EmptyState compacto + CTA "Create pipeline" abre o form', async () => {
    render(<PipelinesPanel />)
    expect(await screen.findByText('No pipelines yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create pipeline/i }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('store.loading → indicador de carregamento em vez do EmptyState', async () => {
    usePipelinesStore.setState({ pipelines: [], loading: true, error: null })
    // Fetch inicial pendente (nunca resolve) → loading permanece true durante o mount.
    vi.mocked(listPipelines).mockReturnValue(new Promise(() => {}))
    render(<PipelinesPanel />)
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('No pipelines yet')).not.toBeInTheDocument()
  })

  it('"+ New pipeline" abre form; submit cria e volta para a lista', async () => {
    vi.mocked(createPipeline).mockResolvedValue({ ...pipeline, id: 'p2', name: 'Deploy' } as never)
    render(<PipelinesPanel />)
    await screen.findByText('No pipelines yet')
    fireEvent.click(screen.getByRole('button', { name: /new pipeline/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Deploy' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Deploy')).toBeInTheDocument()
    expect(createPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Deploy', nodes: [], edges: [] }),
    )
  })

  it('editar selecionado preenche o form; save chama updatePipeline + mostra hint do canvas', async () => {
    vi.mocked(listPipelines).mockResolvedValue([pipeline] as never)
    vi.mocked(updatePipeline).mockResolvedValue({ ...pipeline, name: 'CI v2' } as never)
    render(<PipelinesPanel />)
    fireEvent.click(await screen.findByText('CI Pipeline'))
    expect(screen.getByDisplayValue('CI Pipeline')).toBeInTheDocument()
    // Wire T9 (editorStore.open) — nesta task o hint documenta o caminho.
    expect(screen.getByText(/edit in canvas/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI v2' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(updatePipeline).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'CI v2' }))
    expect(await screen.findByText('CI v2')).toBeInTheDocument()
  })

  it('422 → mensagem amigável inline (role=alert)', async () => {
    vi.mocked(createPipeline).mockRejectedValue(new ApiError(422, [{ loc: ['name'], msg: 'too short' }]))
    render(<PipelinesPanel />)
    await screen.findByText('No pipelines yet')
    fireEvent.click(screen.getByRole('button', { name: /new pipeline/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected the pipeline \(HTTP 422\)/i)
  })

  it('delete com confirm inline remove o pipeline', async () => {
    vi.mocked(listPipelines).mockResolvedValue([pipeline] as never)
    vi.mocked(deletePipeline).mockResolvedValue(undefined as never)
    render(<PipelinesPanel />)
    fireEvent.click(await screen.findByText('CI Pipeline'))
    fireEvent.click(screen.getByRole('button', { name: /^delete pipeline$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(deletePipeline).toHaveBeenCalledWith('p1')
    expect(await screen.findByText('No pipelines yet')).toBeInTheDocument()
  })

  it('validação local: name obrigatório sem chamar a API', async () => {
    render(<PipelinesPanel />)
    await screen.findByText('No pipelines yet')
    fireEvent.click(screen.getByRole('button', { name: /new pipeline/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i)
    expect(createPipeline).not.toHaveBeenCalled()
  })
})
