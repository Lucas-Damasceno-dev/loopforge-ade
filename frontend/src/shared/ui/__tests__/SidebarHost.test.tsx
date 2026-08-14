import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarHost } from '../SidebarHost'

const queryClient = new QueryClient()

function renderHost(active: Parameters<typeof SidebarHost>[0]['active']) {
  const onClose = vi.fn()
  const onExpand = vi.fn()
  const { rerender } = render(
    <QueryClientProvider client={queryClient}>
      <SidebarHost active={active} onClose={onClose} onExpand={onExpand} />
    </QueryClientProvider>,
  )
  return { onClose, onExpand, rerender }
}

describe('SidebarHost', () => {
  it('view leve (prompt): renderiza o NewRunForm inline', () => {
    const { onClose, onExpand } = renderHost('prompt')
    // NewRunForm expõe a textarea de ideia com aria-label="Idea".
    expect(screen.getByLabelText('Idea')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prompt' })).toBeInTheDocument()
    // View leve não tem "Open panel".
    expect(screen.queryByRole('button', { name: /open panel/i })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onExpand).not.toHaveBeenCalled()
  })

  it('view pesada (artifacts): resumo + botão "Open panel" chama onExpand', () => {
    const { onExpand } = renderHost('artifacts')
    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    // Resumo descritivo presente.
    expect(screen.getByText(/files and artifacts/i)).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'Open Artifacts panel' })
    fireEvent.click(open)
    expect(onExpand).toHaveBeenCalledOnce()
  })

  it('botão de fechar chama onClose', () => {
    const { onClose } = renderHost('artifacts')
    fireEvent.click(screen.getByRole('button', { name: 'Close Artifacts' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc fecha (padrão Drawer)', () => {
    const { onClose } = renderHost('settings')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('active=null não renderiza nada', () => {
    renderHost(null)
    expect(screen.queryByRole('aside')).not.toBeInTheDocument()
  })
})
