import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommandPalette } from '../CommandPalette'
import { COMMANDS } from '../../lib/commands'
import type { PaletteCtx } from '../../lib/commands'
import { useAuthStore } from '../../../stores/authStore'

function makeCtx(): PaletteCtx {
  return {
    openView: vi.fn(),
    closeView: vi.fn(),
    openBudgetOverride: vi.fn(),
    toggleInspector: vi.fn(),
    toggleFocus: vi.fn(),
    toggleConsole: vi.fn(),
    focusNewRunIdea: vi.fn(),
  }
}

function renderPalette(ctx: PaletteCtx, onClose = vi.fn()) {
  return render(<CommandPalette open onClose={onClose} ctx={ctx} />)
}

describe('CommandPalette (T7)', () => {
  let ctx: PaletteCtx
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ctx = makeCtx()
    onClose = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('open → input + todos os comandos listados', () => {
    renderPalette(ctx, onClose)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(COMMANDS.length)
    expect(screen.getByText('New run')).toBeInTheDocument()
  })

  it('closed → nada renderizado', () => {
    const { container } = render(<CommandPalette open={false} onClose={onClose} ctx={ctx} />)
    expect(container.firstChild).toBeNull()
  })

  it('digitar filtra a lista (title + keywords, case-insensitive)', () => {
    renderPalette(ctx, onClose)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'BUDGET' } })
    const options = screen.getAllByRole('option')
    // textContent inclui o kbd (ex.: "Budget override⌘⇧B") — substring, não igualdade.
    expect(options.some((o) => o.textContent?.includes('Budget override'))).toBe(true)
    // 'budget' também casa settings via keywords — filtro não é exato.
    expect(options.length).toBeGreaterThan(0)
    expect(options.length).toBeLessThan(COMMANDS.length)
  })

  it('↑↓ move a seleção (aria-selected)', () => {
    renderPalette(ctx, onClose)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Enter executa o comando ativo (spy no ctx) e fecha', () => {
    renderPalette(ctx, onClose)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' }) // index 1 = Runs
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    expect(ctx.openView).toHaveBeenCalledWith('runs')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clique no item executa + fecha', () => {
    renderPalette(ctx, onClose)
    fireEvent.click(screen.getByRole('option', { name: /Toggle console/ }))
    expect(ctx.toggleConsole).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc chama onClose (teclado no input e global)', async () => {
    renderPalette(ctx, onClose)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    // Esc global com foco fora do input.
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
  })

  // ─── T8: overlay click, focus trap, focus restore ─────────────────────────

  it('clique no backdrop fecha (onMouseDown no overlay)', () => {
    renderPalette(ctx, onClose)
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('focus trap: Shift+Tab do input vai p/ o último item; Tab do último volta p/ o primeiro', () => {
    renderPalette(ctx, onClose)
    const input = screen.getByRole('searchbox')
    const options = screen.getAllByRole('option')
    // Foco explícito (auto-focus usa setTimeout 0 — não roda em teste síncrono).
    input.focus()
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(options[options.length - 1])
    fireEvent.keyDown(options[options.length - 1], { key: 'Tab' })
    expect(document.activeElement).toBe(input)
  })

  it('devolve o foco ao trigger ao fechar (focus restore)', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    try {
      trigger.focus()
      const { rerender } = renderPalette(ctx, onClose)
      expect(document.activeElement).toBe(trigger) // guardado no open (antes do auto-focus do input)
      rerender(<CommandPalette open={false} onClose={onClose} ctx={ctx} />)
      expect(document.activeElement).toBe(trigger)
    } finally {
      trigger.remove()
    }
  })
})

// ─── RBAC: filtro por role (budget-override=admin, new-run=runner) ──────────

describe('CommandPalette role filtering (RBAC)', () => {
  let ctx: PaletteCtx
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ctx = makeCtx()
    onClose = vi.fn()
    useAuthStore.setState({ principal: null })
  })

  it('sem principal (BC): budget-override (admin) e new-run (runner) visíveis', () => {
    renderPalette(ctx, onClose)
    expect(screen.getByRole('option', { name: /Budget override/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /New run/ })).toBeInTheDocument()
  })

  it('admin: budget-override e new-run visíveis', () => {
    useAuthStore.setState({ principal: { name: 'admin', roles: ['admin'] } })
    renderPalette(ctx, onClose)
    expect(screen.getByRole('option', { name: /Budget override/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /New run/ })).toBeInTheDocument()
  })

  it('viewer: budget-override (admin) e new-run (runner) ocultos', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    renderPalette(ctx, onClose)
    expect(screen.queryByRole('option', { name: /Budget override/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /New run/ })).not.toBeInTheDocument()
  })

  it('viewer: comando sem role (view-runs) permanece visível', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    renderPalette(ctx, onClose)
    expect(screen.getByRole('option', { name: /Runs/ })).toBeInTheDocument()
  })
})
