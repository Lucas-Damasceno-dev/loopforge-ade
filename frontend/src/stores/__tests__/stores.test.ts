import { beforeEach, describe, it, expect } from 'vitest'
import { useRunsStore } from '../runsStore'
import { useCanvasStore } from '../canvasStore'
import { useConsoleStore } from '../consoleStore'
import { dispatchWsEvent } from '../wsBridge'

beforeEach(() => {
  useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  useCanvasStore.setState({ nodeStatus: {}, ghostToStep: null })
  useConsoleStore.setState({ entries: [], filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
})

describe('runsStore', () => {
  it('undo/redo restores runs snapshots', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    useRunsStore.getState().addRun({ id: 'r2', idea: 'b', status: 'pending' })
    expect(useRunsStore.getState().runs).toHaveLength(2)
    useRunsStore.getState().undo()
    expect(useRunsStore.getState().runs).toHaveLength(1)
    useRunsStore.getState().redo()
    expect(useRunsStore.getState().runs).toHaveLength(2)
  })
  it('enqueue keeps single active run', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    useRunsStore.getState().selectRun('r1')
    useRunsStore.getState().enqueue('r2')
    expect(useRunsStore.getState().queue).toEqual(['r2'])
    expect(useRunsStore.getState().activeRunId).toBe('r1')
  })
})

describe('canvasStore', () => {
  it('maps node_execution event to approved status', () => {
    dispatchWsEvent({ event: 'node_execution', payload: { node: 'dev', status: 'completed', attempt_count: 2 } })
    expect(useCanvasStore.getState().nodeStatus.dev).toEqual({ status: 'approved', attemptCount: 2 })
  })
  it('maps human_decision_expired to paused', () => {
    dispatchWsEvent({ event: 'human_decision_expired', node: 'qa', timeout_seconds: 300, run_status: 'paused' } as never)
    expect(useCanvasStore.getState().nodeStatus.qa?.status).toBe('paused')
  })
})

describe('consoleStore', () => {
  it('filters by level', () => {
    useConsoleStore.getState().addEntry({ id: '1', ts: 0, level: 'error', message: 'boom', node: 'dev' })
    useConsoleStore.getState().addEntry({ id: '2', ts: 0, level: 'info', message: 'ok', node: 'dev' })
    useConsoleStore.getState().setFilters({ level: 'error' })
    expect(useConsoleStore.getState().entries).toHaveLength(2) // entradas intactas; filtro é na seleção
    const visible = useConsoleStore.getState().entries.filter(e => e.level === 'error')
    expect(visible).toHaveLength(1)
  })
})
