import { describe, it, expect, beforeEach } from 'vitest'
import { useConsoleStore } from '../consoleStore'

// Derivação de colapso no STORE (fix wave F2): a transição vazio→cheio
// expande nas AÇÕES (addEntry/appendStream), não num efeito do painel — o App
// remonta o ConsolePanel quando hasContent muda (flat→SplitPane) e um efeito
// local mascarava a transição, escondendo logs com preferência de colapsar.
const entry = (id: string) => ({ id, ts: 0, node: 'developer' as const, level: 'info' as const, message: `msg ${id}` })

beforeEach(() => {
  useConsoleStore.setState({ entries: [], streams: {}, finishedStreams: {}, filters: { node: 'all', level: 'all', query: '' }, autoScroll: true, collapsed: true })
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

describe('consoleStore — guard de stream finalizado (H3)', () => {
  it('finishStream marca a chave runId:node; appendStream descarta chunk atrasado', () => {
    useConsoleStore.getState().appendStream('developer', 'live token', 'r1')
    useConsoleStore.getState().finishStream('developer')
    // Promovido a log e removido do buffer.
    expect(useConsoleStore.getState().entries).toHaveLength(1)
    expect(useConsoleStore.getState().streams).toEqual({})

    // Chunk atrasado (backfill pós-reconnect, mesma runId:nó) → descartado.
    useConsoleStore.getState().appendStream('developer', 'stale token', 'r1')
    expect(useConsoleStore.getState().streams).toEqual({})
    expect(useConsoleStore.getState().entries).toHaveLength(1)
    // Descarte não dispara a transição vazio→cheio (estado preservado).
    expect(useConsoleStore.getState().collapsed).toBe(false)
  })

  it('chave é por runId — stream finalizado de outra run não bloqueia a mesma', () => {
    useConsoleStore.getState().appendStream('developer', 'run 1', 'r1')
    useConsoleStore.getState().finishStream('developer')

    // Nova execução do mesmo nó em OUTRA run → stream legítimo acumula.
    useConsoleStore.getState().appendStream('developer', 'run 2', 'r2')
    expect(useConsoleStore.getState().streams['developer']?.content).toBe('run 2')
  })

  it('appendStream sem runId não é bloqueado por runId explícito (system)', () => {
    useConsoleStore.getState().appendStream('system', 'A', 'r1')
    useConsoleStore.getState().finishStream('system')
    useConsoleStore.getState().appendStream('system', 'B')
    expect(useConsoleStore.getState().streams['system']?.content).toBe('B')
  })

  it('clear reseta finishedStreams (novo ciclo da mesma run re-abre o stream)', () => {
    useConsoleStore.getState().appendStream('developer', 'A', 'r1')
    useConsoleStore.getState().finishStream('developer')
    useConsoleStore.getState().clear()
    useConsoleStore.getState().appendStream('developer', 'B', 'r1')
    expect(useConsoleStore.getState().streams['developer']?.content).toBe('B')
  })
})
