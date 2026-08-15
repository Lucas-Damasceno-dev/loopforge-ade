import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiKeyGate } from '../ApiKeyGate'
import { useAuthStore } from '../../../stores/authStore'

vi.mock(import('../../../shared/lib/api'), async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...mod,
    getApiKey: vi.fn(() => undefined),
    setApiKey: vi.fn(),
    onUnauthorized: vi.fn(() => () => {}),
    retryUnauthorizedRequests: vi.fn(),
    rejectPendingUnauthorized: vi.fn(),
    getAuthMe: vi.fn().mockRejectedValue(new mod.ApiError(401, 'Unauthorized')),
  }
})

vi.mock(import('../../../stores/authStore'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual }
})

describe('ApiKeyGate', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ principal: null })
  })

  it('submit com key inválida mostra erro inline e mantém gate aberto', async () => {
    render(<ApiKeyGate />)
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'bad-key' } })
    fireEvent.click(screen.getByText('Save & retry'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(useAuthStore.getState().principal).toBeNull()
  })

  it('submit com key válida fecha o gate e seta principal', async () => {
    useAuthStore.setState({
      login: vi.fn(async () => {
        useAuthStore.setState({ principal: { name: 'runner-svc', roles: ['runner'] } })
      }),
    } as never)
    render(<ApiKeyGate />)
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'runner-key-456' } })
    fireEvent.click(screen.getByText('Save & retry'))
    await waitFor(() => {
      expect(useAuthStore.getState().principal?.name).toBe('runner-svc')
    })
  })
})
