import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewRunForm, STACK_OPTIONS, ROUTING_OPTIONS } from '../NewRunForm'
import { createRun } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', () => ({ createRun: vi.fn() }))

const queryClient = new QueryClient()

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <NewRunForm onCreated={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('NewRunForm', () => {
  beforeEach(() => {
    vi.mocked(createRun).mockReset()
    vi.mocked(createRun).mockResolvedValue({ id: 'r1', idea: 'x', stack: 'python', status: 'pending' })
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
      expect(args?.[0]).toEqual({ idea: 'build a cli', stack: 'go', routing_mode: 'fast' })
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
      expect(args?.[0]).toEqual({ idea: 'build a cli', stack: 'python', routing_mode: 'full' })
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
        model: 'opencode-go/deepseek-v4-flash',
      })
    })
  })
})
