import { describe, it, expect, beforeEach } from 'vitest'
import { useConsoleStore } from '../consoleStore'

// Derivação de colapso no STORE (fix wave F2): a transição vazio→cheio
// expande nas AÇÕES (addEntry/appendStream), não num efeito do painel — o App
// remonta o ConsolePanel quando hasContent muda (flat→SplitPane) e um efeito
// local mascarava a transição, escondendo logs com preferência de colapsar.
const entry = (id: string) => ({ id, ts: 0, node: 'developer' as const, level: 'info' as const, message: `msg ${id}` })

beforeEach(() => {
  useConsoleStore.setState({ entries: [], streams: {}, filters: { node: 'all', level: 'all', query: '' }, autoScroll: true, collapsed: true })
})

describe('consoleStore — derivação de colapso', () => {
  it('addEntry em estado vazio → collapsed=false, mesmo com collapsed=true (preferência manual)', () => {
    useConsoleStore.getState().addEntry(entry('1'))
    expect(useConsoleStore.getState().collapsed).toBe(false)
  })

  it('appendStream em estado vazio → collapsed=false', () => {
    useConsoleStore.getState().appendStream('developer', 'chunk')
    expect(useConsoleStore.getState().collapsed).toBe(false)
  })

  it('addEntry com conteúdo já presente → collapsed permanece (preferência manual respeitada)', () => {
    useConsoleStore.getState().addEntry(entry('1')) // expande (transição)
    useConsoleStore.getState().setCollapsed(true) // colapsa manualmente
    useConsoleStore.getState().addEntry(entry('2')) // NÃO é transição → não expande
    expect(useConsoleStore.getState().collapsed).toBe(true)
  })

  it('clear → esvazia e colapsa (auto-collapse histórico)', () => {
    useConsoleStore.getState().addEntry(entry('1'))
    useConsoleStore.getState().clear()
    expect(useConsoleStore.getState().entries).toHaveLength(0)
    expect(useConsoleStore.getState().collapsed).toBe(true)
  })

  it('finishStream não expande por si só (stream já tinha conteúdo)', () => {
    useConsoleStore.getState().appendStream('developer', 'text') // expande
    useConsoleStore.getState().setCollapsed(true) // colapsa manualmente
    useConsoleStore.getState().finishStream('developer') // promove p/ entry — sem transição
    expect(useConsoleStore.getState().collapsed).toBe(true)
  })
})
