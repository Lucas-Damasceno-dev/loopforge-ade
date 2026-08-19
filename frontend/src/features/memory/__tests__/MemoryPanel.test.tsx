import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryPanelContent } from '../MemoryPanel'
import { createLesson, deleteLesson, listLessons } from '../../../shared/lib/api'
import type { Lesson } from '../../../shared/lib/types'

vi.mock('../../../shared/lib/api', () => ({
  listLessons: vi.fn(),
  createLesson: vi.fn(),
  deleteLesson: vi.fn(),
}))

const LESSONS: Lesson[] = [
  {
    id: 1,
    run_id: 'run-1',
    stack: 'python',
    idea: 'Pydantic v2',
    lesson_text: 'Usar Pydantic v2 para validação rigorosa de schemas na API REST.',
    created_at: 1700000000,
  },
  {
    id: 2,
    run_id: 'run-2',
    stack: 'java',
    idea: 'Spring Boot',
    lesson_text: 'Prefira interfaces para desacoplar serviços no Spring.',
    created_at: 1700003600,
  },
]

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryPanelContent />
    </QueryClientProvider>,
  )
}

// Form de criação é colapsado por default — abre no toggle "New lesson".
async function openCreateForm() {
  await userEvent.click(screen.getByRole('button', { name: 'New lesson' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MemoryPanel (lições aprendidas)', () => {
  it('loads and renders lessons with stack badge, idea, truncated text and date', async () => {
    vi.mocked(listLessons).mockResolvedValue(LESSONS)
    renderPanel()
    expect(await screen.findByText('Pydantic v2')).toBeInTheDocument()
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByText('java')).toBeInTheDocument()
    expect(screen.getByText('Spring Boot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete lesson 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete lesson 2' })).toBeInTheDocument()
    expect(listLessons).toHaveBeenCalledWith({})
  })

  it('truncates long lesson text and keeps full text as title', async () => {
    const long: Lesson = { ...LESSONS[0], lesson_text: 'x'.repeat(300) }
    vi.mocked(listLessons).mockResolvedValue([long])
    renderPanel()
    const text = await screen.findByTitle('x'.repeat(300))
    expect(text).toHaveTextContent('x'.repeat(140) + '…')
  })

  it('search applies query and stack filters via listLessons params', async () => {
    vi.mocked(listLessons).mockResolvedValue(LESSONS)
    renderPanel()
    await screen.findByText('Pydantic v2')
    await userEvent.type(screen.getByLabelText('Search lessons'), 'pydantic')
    await userEvent.type(screen.getByLabelText('Search stack'), 'python')
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => expect(listLessons).toHaveBeenLastCalledWith({ query: 'pydantic', stack: 'python' }))
  })

  it('reset clears filters back to unfiltered list', async () => {
    vi.mocked(listLessons).mockResolvedValue(LESSONS)
    renderPanel()
    await screen.findByText('Pydantic v2')
    await userEvent.type(screen.getByLabelText('Search lessons'), 'pydantic')
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => expect(listLessons).toHaveBeenLastCalledWith({ query: 'pydantic' }))
    await userEvent.click(screen.getByRole('button', { name: /^reset$/i }))
    await waitFor(() => expect(listLessons).toHaveBeenLastCalledWith({}))
    expect(screen.getByLabelText('Search lessons')).toHaveValue('')
  })

  it('creates a lesson and falls back run_id to manual when empty', async () => {
    vi.mocked(listLessons).mockResolvedValue([])
    vi.mocked(createLesson).mockResolvedValue(LESSONS[0])
    renderPanel()
    await screen.findByText('No lessons yet')
    await openCreateForm()
    await userEvent.type(screen.getByLabelText('Stack'), 'python')
    await userEvent.type(screen.getByLabelText('Idea'), 'API REST')
    await userEvent.type(screen.getByLabelText('Lesson text'), 'Valide com Pydantic v2.')
    await userEvent.click(screen.getByRole('button', { name: /^add lesson$/i }))
    await waitFor(() => expect(createLesson).toHaveBeenCalledTimes(1))
    expect(createLesson).toHaveBeenCalledWith({
      run_id: 'manual',
      stack: 'python',
      idea: 'API REST',
      lesson_text: 'Valide com Pydantic v2.',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Lesson saved')
  })

  it('uses the provided run_id when filled', async () => {
    vi.mocked(listLessons).mockResolvedValue([])
    vi.mocked(createLesson).mockResolvedValue(LESSONS[0])
    renderPanel()
    await screen.findByText('No lessons yet')
    await openCreateForm()
    await userEvent.type(screen.getByLabelText('Run ID'), 'run-42')
    await userEvent.type(screen.getByLabelText('Lesson text'), 'Li\u00e7\u00e3o nova.')
    await userEvent.click(screen.getByRole('button', { name: /^add lesson$/i }))
    await waitFor(() =>
      expect(createLesson).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: 'run-42', lesson_text: 'Li\u00e7\u00e3o nova.' }),
      ),
    )
  })

  it('deletes a lesson calling deleteLesson with its id', async () => {
    vi.mocked(listLessons).mockResolvedValue(LESSONS)
    vi.mocked(deleteLesson).mockResolvedValue({ deleted: true })
    renderPanel()
    await screen.findByText('Pydantic v2')
    await userEvent.click(screen.getByRole('button', { name: 'Delete lesson 1' }))
    await waitFor(() => expect(deleteLesson).toHaveBeenCalledWith(1))
  })

  it('shows backend detail on load error (role=alert)', async () => {
    vi.mocked(listLessons).mockRejectedValue(
      Object.assign(new Error('x'), { status: 500, detail: 'Falha ao ler telemetry.sqlite' }),
    )
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao ler telemetry.sqlite')
  })

  it('disables Add lesson while the lesson text is empty', async () => {
    vi.mocked(listLessons).mockResolvedValue([])
    renderPanel()
    await screen.findByText('No lessons yet')
    await openCreateForm()
    expect(screen.getByRole('button', { name: /^add lesson$/i })).toBeDisabled()
  })
})
