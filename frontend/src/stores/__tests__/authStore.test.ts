import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../authStore'
import { getAuthMe, setApiKey } from '../../shared/lib/api'

vi.mock('../../shared/lib/api', () => ({
  getAuthMe: vi.fn(),
  getApiKey: vi.fn(() => undefined),
  setApiKey: vi.fn(),
  retryUnauthorizedRequests: vi.fn(),
  rejectPendingUnauthorized: vi.fn(),
}))

const mockedGetAuthMe = vi.mocked(getAuthMe)

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ principal: null })
  })

  it('login salva key, busca principal e persiste', async () => {
    mockedGetAuthMe.mockResolvedValue({ name: 'runner-svc', roles: ['runner'] })
    await useAuthStore.getState().login('runner-key-456')
    expect(setApiKey).toHaveBeenCalledWith('runner-key-456')
    expect(useAuthStore.getState().principal).toEqual({ name: 'runner-svc', roles: ['runner'] })
    expect(localStorage.getItem('lf_auth_principal')).toContain('runner-svc')
  })

  it('login com key inválida rejeita e não seta principal', async () => {
    mockedGetAuthMe.mockRejectedValue(new Error('API 401'))
    await expect(useAuthStore.getState().login('bad')).rejects.toThrow()
    expect(useAuthStore.getState().principal).toBeNull()
  })

  it('logout limpa principal e key', () => {
    localStorage.setItem('lf_auth_principal', JSON.stringify({ name: 'a', roles: ['admin'] }))
    useAuthStore.setState({ principal: { name: 'a', roles: ['admin'] } })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().principal).toBeNull()
  })

  it('can(): sem principal → true (BC admin); hierarquia viewer<runner<admin', () => {
    expect(useAuthStore.getState().can('admin')).toBe(true)
    useAuthStore.setState({ principal: { name: 'v', roles: ['viewer'] } })
    expect(useAuthStore.getState().can('viewer')).toBe(true)
    expect(useAuthStore.getState().can('runner')).toBe(false)
    useAuthStore.setState({ principal: { name: 'r', roles: ['runner'] } })
    expect(useAuthStore.getState().can('runner')).toBe(true)
    expect(useAuthStore.getState().can('admin')).toBe(false)
    useAuthStore.setState({ principal: { name: 'a', roles: ['admin'] } })
    expect(useAuthStore.getState().can('admin')).toBe(true)
  })
})
