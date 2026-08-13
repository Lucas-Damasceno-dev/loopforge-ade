import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QueueBadge } from '../QueueBadge'
import { getRunQueue } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', () => ({ getRunQueue: vi.fn() }))

const queryClient = new QueryClient()

function renderBadge() {
  return render(
    <QueryClientProvider client={queryClient}>
      <QueueBadge />
    </QueryClientProvider>,
  )
}

describe('QueueBadge', () => {
  beforeEach(() => {
    vi.mocked(getRunQueue).mockReset()
    queryClient.clear()
  })

  it('mostra contagem ativa/máx + fila quando o endpoint responde', async () => {
    vi.mocked(getRunQueue).mockResolvedValue({
      max_concurrent: 2,
      active_count: 1,
      active: ['r1'],
      queued: [{ id: 'r2', idea: 'x', stack: 'python', status: 'queued' }],
    })
    renderBadge()
    const badge = await screen.findByTestId('queue-badge')
    expect(badge.textContent).toContain('1/2')
    expect(badge.textContent).toContain('1 waiting')
  })

  it('não renderiza nada quando o endpoint falha (engine antigo)', async () => {
    vi.mocked(getRunQueue).mockRejectedValue(new Error('404'))
    renderBadge()
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('queue-badge')).not.toBeInTheDocument()
  })
})
