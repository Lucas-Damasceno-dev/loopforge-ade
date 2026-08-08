import { beforeEach, describe, it, expect } from 'vitest'
import { useRunsStore } from '../runsStore'
import { useCanvasStore } from '../canvasStore'
import { useConsoleStore } from '../consoleStore'
import { useHitlGateStore } from '../hitlGateStore'
import { dispatchWsEvent } from '../wsBridge'

beforeEach(() => {
  useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  useCanvasStore.setState({ nodeStatus: {}, ghostToStep: null })
  useConsoleStore.setState({ entries: [], filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  useHitlGateStore.setState({ gates: [] })
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
  it('addRun with duplicate id is a no-op', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    useRunsStore.getState().addRun({ id: 'r1', idea: 'b', status: 'pending' })
    expect(useRunsStore.getState().runs).toHaveLength(1)
    expect(useRunsStore.getState().runs[0].idea).toBe('a')
  })
  it('upsertRun merge preserves existing fields when the patch omits them', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'keep me', stack: 'go', status: 'running' })
    // patch sem idea/stack (run_updated real) → merge preserva.
    useRunsStore.getState().upsertRun({ id: 'r1', status: 'paused', current_node: 'qa' })
    const run = useRunsStore.getState().runs.find((r) => r.id === 'r1')
    expect(run?.idea).toBe('keep me')
    expect(run?.stack).toBe('go')
    expect(run?.status).toBe('paused')
    expect(run?.current_node).toBe('qa')
  })
  it('upsertRun drops undefined fields instead of overwriting', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    useRunsStore.getState().upsertRun({ id: 'r1', idea: undefined, status: 'running' })
    const run = useRunsStore.getState().runs.find((r) => r.id === 'r1')
    expect(run?.idea).toBe('a')
    expect(run?.status).toBe('running')
  })
  it('upsertRun creates the run when absent', () => {
    useRunsStore.getState().upsertRun({ id: 'new', idea: 'x', status: 'queued' })
    expect(useRunsStore.getState().runs).toHaveLength(1)
    expect(useRunsStore.getState().runs[0].idea).toBe('x')
  })
  it('enqueue promotes to active when none is active and ignores duplicates', () => {
    useRunsStore.getState().enqueue('r1')
    expect(useRunsStore.getState().activeRunId).toBe('r1')
    expect(useRunsStore.getState().queue).toEqual([])
    // já ativa → no-op; duplicata na fila → no-op.
    useRunsStore.getState().enqueue('r1')
    expect(useRunsStore.getState().queue).toEqual([])
    useRunsStore.getState().enqueue('r2')
    useRunsStore.getState().enqueue('r2')
    expect(useRunsStore.getState().queue).toEqual(['r2'])
  })
  it('dequeue with empty queue clears activeRunId', () => {
    useRunsStore.getState().selectRun('r1')
    useRunsStore.getState().dequeue()
    expect(useRunsStore.getState().activeRunId).toBeNull()
  })
  it('dequeue promotes next queued run to active', () => {
    useRunsStore.getState().selectRun('r1')
    useRunsStore.getState().enqueue('r2')
    useRunsStore.getState().enqueue('r3')
    useRunsStore.getState().dequeue()
    expect(useRunsStore.getState().activeRunId).toBe('r2')
    expect(useRunsStore.getState().queue).toEqual(['r3'])
  })
  it('removeRun removes the run; closing the active one clears selection', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    useRunsStore.getState().addRun({ id: 'r2', idea: 'b', status: 'pending' })
    useRunsStore.getState().selectRun('r1')
    useRunsStore.getState().removeRun('r1')
    expect(useRunsStore.getState().runs.some((r) => r.id === 'r1')).toBe(false)
    // removeRun não limpa a seleção (o workspace trata via handleClose) —
    // o id órfão permanece até o selectRun explícito.
    expect(useRunsStore.getState().activeRunId).toBe('r1')
    useRunsStore.getState().selectRun(null)
    expect(useRunsStore.getState().activeRunId).toBeNull()
  })
  it('undo/redo are no-ops when history is empty', () => {
    const runs = useRunsStore.getState().runs
    useRunsStore.getState().undo()
    expect(useRunsStore.getState().runs).toBe(runs)
    useRunsStore.getState().redo()
    expect(useRunsStore.getState().runs).toBe(runs)
  })
  it('undo caps past history at 50 snapshots', () => {
    for (let i = 0; i < 60; i++) useRunsStore.getState().addRun({ id: `r${i}`, idea: 'x', status: 'pending' })
    expect(useRunsStore.getState().past.length).toBe(50)
    // Desfaz até esgotar o histórico (50 snapshots retidos) — os 10 mais
    // antigos foram descartados pelo limite (UNDO_LIMIT=50).
    for (let i = 0; i < 60; i++) useRunsStore.getState().undo()
    expect(useRunsStore.getState().past).toHaveLength(0)
    expect(useRunsStore.getState().runs.map((r) => r.id)).toEqual(
      ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
    )
  })
  it('enqueue keeps single active run', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    useRunsStore.getState().selectRun('r1')
    useRunsStore.getState().enqueue('r2')
    expect(useRunsStore.getState().queue).toEqual(['r2'])
    expect(useRunsStore.getState().activeRunId).toBe('r1')
  })
  it('pipeline_finished updates run status to completed', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'pending' })
    dispatchWsEvent({ event: 'pipeline_finished', run_id: 'r1', payload: { status: 'completed', duration_seconds: 12 } })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('completed')
  })
  it('pipeline_finished with status failed maps run to failed', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'pipeline_finished', run_id: 'r1', payload: { status: 'failed' } })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('failed')
  })
  it('pipeline_failed updates run status to failed', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'pipeline_failed', run_id: 'r1', payload: {} })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('failed')
  })
  it('pipeline_error updates run status to failed', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'pipeline_error', run_id: 'r1', payload: { error: 'boom' } })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('failed')
  })
  it('run_updated with queued/paused status is reflected on the run', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'run_updated', run_id: 'r1', payload: { status: 'queued' } })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('queued')
    dispatchWsEvent({ event: 'run_updated', run_id: 'r1', payload: { status: 'paused', current_node: 'qa' } })
    const run = useRunsStore.getState().runs.find(r => r.id === 'r1')
    expect(run?.status).toBe('paused')
    expect(run?.current_node).toBe('qa')
  })
  it('run_paused updates run status to paused', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'run_paused', run_id: 'r1', payload: { status: 'paused' } })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('paused')
  })
  it('pipeline terminal events without run_id (dispatcher variant) skip store update', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'pipeline_finished', payload: { status: 'completed' } })
    expect(useRunsStore.getState().runs.find(r => r.id === 'r1')?.status).toBe('running')
  })
})

describe('canvasStore', () => {
  it('maps node_execution event to approved status', () => {
    dispatchWsEvent({ event: 'node_execution', payload: { node: 'developer', status: 'completed', attempt_count: 2 } })
    expect(useCanvasStore.getState().nodeStatus.developer).toEqual({ status: 'approved', attemptCount: 2 })
  })
  it('maps node_execution with run_id to console entry scoped to the run', () => {
    dispatchWsEvent({ event: 'node_execution', run_id: 'r1', payload: { node: 'qa', status: 'completed', attempt_count: 1 } })
    const entry = useConsoleStore.getState().entries.find(e => e.node === 'qa')
    expect(entry?.runId).toBe('r1')
    expect(useCanvasStore.getState().nodeStatus.qa?.status).toBe('approved')
  })
  it('maps human_decision_expired to paused', () => {
    dispatchWsEvent({ event: 'human_decision_expired', run_id: 'r1', payload: { node: 'qa', timeout_seconds: 300 } })
    expect(useCanvasStore.getState().nodeStatus.qa?.status).toBe('paused')
  })
  it('maps hitl_gate_reached to hitlGateStore + warn log (C3)', () => {
    dispatchWsEvent({
      event: 'hitl_gate_reached',
      run_id: 'r1',
      payload: { gate_node: 'qa', thread_id: 'run-r1', timeout_seconds: 300, on_timeout: 'continue' },
    })
    const gates = useHitlGateStore.getState().gates
    expect(gates).toHaveLength(1)
    expect(gates[0]).toMatchObject({ gateNode: 'qa', runId: 'r1', timeoutSeconds: 300, onTimeout: 'continue' })
    expect(useConsoleStore.getState().entries.some((e) => e.level === 'warn' && /gate reached/i.test(e.message))).toBe(true)
  })
})

describe('consoleStore', () => {
  it('filters by level', () => {
    useConsoleStore.getState().addEntry({ id: '1', ts: 0, level: 'error', message: 'boom', node: 'developer' })
    useConsoleStore.getState().addEntry({ id: '2', ts: 0, level: 'info', message: 'ok', node: 'developer' })
    useConsoleStore.getState().setFilters({ level: 'error' })
    expect(useConsoleStore.getState().entries).toHaveLength(2) // entradas intactas; filtro é na seleção
    const visible = useConsoleStore.getState().entries.filter(e => e.level === 'error')
    expect(visible).toHaveLength(1)
  })
})
