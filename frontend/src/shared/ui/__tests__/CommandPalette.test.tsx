import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommandPalette } from '../CommandPalette'
import { COMMANDS } from '../../lib/commands'
import type { PaletteCtx } from '../../lib/commands'

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
})
