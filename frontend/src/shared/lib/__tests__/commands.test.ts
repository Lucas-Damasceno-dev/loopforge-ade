import { describe, it, expect, vi } from 'vitest'
import { COMMANDS, filterCommands } from '../commands'
import type { PaletteCtx } from '../commands'

// ctx mock puro — commands.ts não importa stores (contrato do brief).
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

describe('commands (T7)', () => {
  it('ids únicos no registro', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('filtra por keyword e title, case-insensitive', () => {
    const byKeyword = filterCommands('MEMORY').map((c) => c.id)
    expect(byKeyword).toContain('view-memory')
    const byTitle = filterCommands('budget').map((c) => c.id)
    expect(byTitle).toContain('budget-override')
    expect(byTitle).toContain('view-settings') // 'budget' nas keywords de settings
  })

  it('query vazia → todos os comandos', () => {
    expect(filterCommands('')).toHaveLength(COMMANDS.length)
    expect(filterCommands('   ')).toHaveLength(COMMANDS.length)
  })

  it('run chama a ação correta no ctx (mock)', () => {
    const ctx = makeCtx()
    const byId = (id: string) => COMMANDS.find((c) => c.id === id)!

    byId('new-run').run(ctx)
    expect(ctx.focusNewRunIdea).toHaveBeenCalledTimes(1)

    byId('view-settings').run(ctx)
    expect(ctx.openView).toHaveBeenCalledWith('settings')

    byId('toggle-console').run(ctx)
    expect(ctx.toggleConsole).toHaveBeenCalledTimes(1)

    byId('toggle-inspector').run(ctx)
    expect(ctx.toggleInspector).toHaveBeenCalledTimes(1)

    byId('focus-mode').run(ctx)
    expect(ctx.toggleFocus).toHaveBeenCalledTimes(1)

    byId('budget-override').run(ctx)
    expect(ctx.openBudgetOverride).toHaveBeenCalledTimes(1)

    // Close palette: run é no-op (UI manipula); não toca ctx.
    byId('palette-close').run(ctx)
    expect(ctx.closeView).not.toHaveBeenCalled()
  })
})
