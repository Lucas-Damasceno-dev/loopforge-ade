import { beforeEach, describe, it, expect, vi } from 'vitest'
import { registerWsHandler, dispatchWsEvent, handleWsEvent } from '../wsBridge'
import type { WsEvent } from '../../shared/lib/ws'
import { useRunsStore } from '../runsStore'
import { useCanvasStore } from '../canvasStore'
import { useConsoleStore } from '../consoleStore'
import { useHitlGateStore } from '../hitlGateStore'

// Edge cases do barramento wsBridge (mapeamento WS → stores): eventos mal
// formados não podem derrubar as stores nem gerar entradas de console órfãs.

beforeEach(() => {
  useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [], cbByRun: {} })
  useCanvasStore.setState({ nodeStatus: {}, ghostToStep: null })
  useConsoleStore.setState({
    entries: [],
    streams: {},
    filters: { node: 'all', level: 'all', query: '' },
    autoScroll: true,
  })
  useHitlGateStore.setState({ gates: [] })
})

describe('registerWsHandler', () => {
  it('dispatches to every registered handler and unsubscribes', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = registerWsHandler(a)
    registerWsHandler(b)
    const ev = { event: 'pipeline_started' as const, payload: { idea: 'x', node: 'cpo' } }
    dispatchWsEvent(ev)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    unsubA()
    dispatchWsEvent(ev)
    expect(a).toHaveBeenCalledTimes(1) // não recebe mais
    expect(b).toHaveBeenCalledTimes(2)
  })
})

describe('handleWsEvent edge cases', () => {
  it('run_created without run_id is ignored without crashing', () => {
    expect(() => dispatchWsEvent({ event: 'run_created', payload: { idea: 'x', status: 'pending' } })).not.toThrow()
    expect(useRunsStore.getState().runs).toHaveLength(0)
    expect(useConsoleStore.getState().entries).toHaveLength(0)
  })

  it('run_updated without idea/current_node preserves the existing run (merge)', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'original', stack: 'go', status: 'running' })
    dispatchWsEvent({ event: 'run_updated', run_id: 'r1', payload: { status: 'paused' } })
    const run = useRunsStore.getState().runs.find((r) => r.id === 'r1')
    expect(run?.idea).toBe('original')
    expect(run?.status).toBe('paused')
    expect(run?.current_node).toBeUndefined()
  })

  it('run_updated with unknown status falls back to pending', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'run_updated', run_id: 'r1', payload: { status: 'bogus_status' } })
    expect(useRunsStore.getState().runs.find((r) => r.id === 'r1')?.status).toBe('pending')
  })

  it('human_decision_expired with unknown node does not touch canvas', () => {
    dispatchWsEvent({ event: 'human_decision_expired', run_id: 'r1', payload: { node: 'mystery', timeout_seconds: 300 } })
    expect(useCanvasStore.getState().nodeStatus).toEqual({})
    // loga warn com fallback system.
    expect(useConsoleStore.getState().entries.some((e) => e.level === 'warn' && e.node === 'system')).toBe(true)
  })

  it('human_decision_expired without run_id still pauses the node', () => {
    dispatchWsEvent({ event: 'human_decision_expired', payload: { node: 'qa', timeout_seconds: 60 } })
    expect(useCanvasStore.getState().nodeStatus.qa?.status).toBe('paused')
  })

  it('hitl_gate_reached minimal payload pushes gate with ? fallbacks', () => {
    // O tipo WsEventHitlGate exige gate_node, mas o bridge defende payloads
    // sem o campo (defense-in-depth pós-normalização) — testa o fallback '?'.
    const ev = { event: 'hitl_gate_reached', payload: {} } as unknown as WsEvent
    dispatchWsEvent(ev)
    const gates = useHitlGateStore.getState().gates
    expect(gates).toHaveLength(1)
    expect(gates[0]).toMatchObject({ gateNode: '?', runId: undefined, threadId: undefined })
  })

  it('run_paused without run_id is a no-op', () => {
    expect(() => dispatchWsEvent({ event: 'run_paused', payload: { status: 'paused' } })).not.toThrow()
    expect(useRunsStore.getState().runs).toHaveLength(0)
  })

  it('pipeline_started logs info without touching stores', () => {
    dispatchWsEvent({ event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } })
    expect(useRunsStore.getState().runs).toHaveLength(0)
    expect(useCanvasStore.getState().nodeStatus).toEqual({})
    expect(useConsoleStore.getState().entries.some((e) => e.level === 'info')).toBe(true)
  })

  it('pipeline_terminal events without run_id skip store updates (dispatcher variant)', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'a', status: 'running' })
    dispatchWsEvent({ event: 'pipeline_finished', payload: { status: 'completed' } })
    expect(useRunsStore.getState().runs.find((r) => r.id === 'r1')?.status).toBe('running')
    dispatchWsEvent({ event: 'pipeline_failed', payload: { error: 'x' } })
    expect(useRunsStore.getState().runs.find((r) => r.id === 'r1')?.status).toBe('running')
  })

  it('hitl gate dedupe keeps one gate per (runId, gateNode) key', () => {
    dispatchWsEvent({ event: 'hitl_gate_reached', run_id: 'r1', payload: { gate_node: 'qa' } })
    dispatchWsEvent({ event: 'hitl_gate_reached', run_id: 'r1', payload: { gate_node: 'qa', timeout_seconds: 30 } })
    expect(useHitlGateStore.getState().gates).toHaveLength(1)
    expect(useHitlGateStore.getState().gates[0].timeoutSeconds).toBe(30)
  })

  it('pipeline_resumed atualiza status da run para running', () => {
    useRunsStore.setState({ runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }], activeRunId: 'r1', queue: [], past: [], future: [] })
    dispatchWsEvent({ event: 'pipeline_resumed', run_id: 'r1', payload: {} })
    expect(useRunsStore.getState().runs[0].status).toBe('running')
  })

  it('token_delta appends to stream buffer keyed by node (ADR-0007)', () => {
    dispatchWsEvent({ event: 'token_delta', run_id: 'r1', payload: { node: 'developer', content: 'Ola' } })
    dispatchWsEvent({ event: 'token_delta', run_id: 'r1', payload: { node: 'developer', content: ' mundo' } })
    const streams = useConsoleStore.getState().streams
    expect(streams.developer).toMatchObject({ node: 'developer', content: 'Ola mundo', runId: 'r1' })
    // Buffer não vira entry: fica acumulando até o flush.
    expect(useConsoleStore.getState().entries).toHaveLength(0)
  })

  it('node_execution flushes the stream buffer into a console entry', () => {
    dispatchWsEvent({ event: 'token_delta', run_id: 'r1', payload: { node: 'developer', content: 'print("x")' } })
    dispatchWsEvent({ event: 'node_execution', run_id: 'r1', payload: { node: 'developer', status: 'completed' } })
    expect(useConsoleStore.getState().streams.developer).toBeUndefined()
    const entry = useConsoleStore.getState().entries.find((e) => e.node === 'developer')
    expect(entry?.message).toBe('print("x")')
    expect(entry?.level).toBe('info')
  })

  it('circuit_breaker_changed grava estado por run e loga warn', () => {
    dispatchWsEvent({ event: 'circuit_breaker_changed', run_id: 'r1', payload: { state: 'open', consecutive_failures: 5, total_iterations: 20, total_cost: 2.5 } })
    expect(useRunsStore.getState().cbByRun.r1).toBe('open')
    expect(useConsoleStore.getState().entries.some((e) => e.level === 'warn' && e.message === 'circuit breaker: open')).toBe(true)
  })

  it('circuit_breaker_changed com estado inválido é ignorado (sem crash)', () => {
    dispatchWsEvent({ event: 'circuit_breaker_changed', run_id: 'r1', payload: { state: 'bogus' } })
    expect(useRunsStore.getState().cbByRun.r1).toBeUndefined()
  })

  it('circuit_breaker_changed sem run_id só loga (sem tocar store)', () => {
    dispatchWsEvent({ event: 'circuit_breaker_changed', payload: { state: 'closed' } })
    expect(useRunsStore.getState().cbByRun).toEqual({})
    expect(useConsoleStore.getState().entries.some((e) => e.level === 'warn' && e.message === 'circuit breaker: closed')).toBe(true)
  })

  it('run_updated propaga degraded/degraded_reason para a run', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'x', stack: 'python', status: 'running' })
    dispatchWsEvent({ event: 'run_updated', run_id: 'r1', payload: { status: 'running', degraded: true, degraded_reason: 'mock fallback' } })
    const run = useRunsStore.getState().runs.find((r) => r.id === 'r1')
    expect(run?.degraded).toBe(true)
    expect(run?.degraded_reason).toBe('mock fallback')
  })

  it('run_updated sem degraded preserva o campo existente', () => {
    useRunsStore.getState().addRun({ id: 'r1', idea: 'x', stack: 'python', status: 'running', degraded: true })
    dispatchWsEvent({ event: 'run_updated', run_id: 'r1', payload: { status: 'running' } })
    expect(useRunsStore.getState().runs.find((r) => r.id === 'r1')?.degraded).toBe(true)
  })
})

describe('handleWsEvent direct', () => {
  it('is exported and idempotent for node_execution', () => {
    handleWsEvent({ event: 'node_execution', payload: { node: 'cpo', status: 'completed', attempt_count: 1 } })
    handleWsEvent({ event: 'node_execution', payload: { node: 'cpo', status: 'completed', attempt_count: 3 } })
    expect(useCanvasStore.getState().nodeStatus.cpo).toEqual({ status: 'approved', attemptCount: 3 })
  })
})
