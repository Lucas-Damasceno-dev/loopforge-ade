import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiKeyGate } from '../ApiKeyGate'
import { apiFetch, getApiKey, setApiKey } from '../../../shared/lib/api'

describe('ApiKeyGate', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the key screen on entry when no key is saved', () => {
    render(<ApiKeyGate />)
    expect(screen.getByRole('dialog', { name: /api key required/i })).toBeInTheDocument()
  })

  it('saving the key stores it and closes the modal', () => {
    render(<ApiKeyGate />)
    fireEvent.change(screen.getByLabelText(/^api key$/i), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /save.*retry/i }))
    expect(getApiKey()).toBe('secret')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('dismiss allows demo without backend (no key saved)', () => {
    render(<ApiKeyGate />)
    fireEvent.click(screen.getByRole('button', { name: /continue without backend/i }))
    expect(getApiKey()).toBeUndefined()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reopens when a real API call gets 401 and retries it on save', async () => {
    setApiKey('k') // key já salva → gate fechado ao montar
    render(<ApiKeyGate />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Chamada real responde 401 → gate reabre e a chamada fica pendente.
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }))
    const pending = apiFetch<{ ok: boolean }>('/runs')
    await waitFor(() => expect(screen.getByRole('dialog', { name: /api key required/i })).toBeInTheDocument())

    // Salva nova key → retry reexecuta a chamada pendente (agora 200).
    fireEvent.change(screen.getByLabelText(/^api key$/i), { target: { value: 'new-secret' } })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    fireEvent.click(screen.getByRole('button', { name: /save.*retry/i }))
    await expect(pending).resolves.toEqual({ ok: true })
    expect(getApiKey()).toBe('new-secret')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('rejects pending calls when dismissed without key (demo mode)', async () => {
    render(<ApiKeyGate />) // sem key → aberto
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }))
    const pending = apiFetch<{ ok: boolean }>('/runs')
    // Assinatura ANTES de dispensar: evita unhandled rejection.
    const rejection = expect(pending).rejects.toThrow()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /continue without backend/i }))
    await rejection
    expect(getApiKey()).toBeUndefined()
  })
})
