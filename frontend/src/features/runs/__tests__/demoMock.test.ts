import { afterEach, beforeEach, it, expect, vi } from 'vitest'
import { runDemo } from '../demoMock'
import { useRunsStore } from '../../../stores/runsStore'

beforeEach(() => { vi.useFakeTimers(); useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] }) })
afterEach(() => { vi.useRealTimers() })

it('creates demo run and completes pipeline', () => {
  runDemo()
  expect(useRunsStore.getState().runs).toHaveLength(1)
  const id = useRunsStore.getState().runs[0].id
  expect(id.startsWith('demo-')).toBe(true)
  vi.advanceTimersByTime(30_000)
  const run = useRunsStore.getState().runs.find(r => r.id === id)
  expect(run?.status).toBe('completed')
})

it('enqueues demo run immediately when another run is active (E3)', () => {
  useRunsStore.getState().addRun({ id: 'real-1', idea: 'x', status: 'running' })
  useRunsStore.getState().selectRun('real-1')
  runDemo()
  const demoId = useRunsStore.getState().runs.find(r => r.id.startsWith('demo-'))!.id
  // Imediatamente após addRun (sem avançar timers): demo na fila, ativa intacta
  // (rótulo "queued" vale durante toda a execução).
  expect(useRunsStore.getState().queue).toContain(demoId)
  expect(useRunsStore.getState().activeRunId).toBe('real-1')
  // Durante a execução (pipeline não completou): continua na fila.
  vi.advanceTimersByTime(1_000)
  expect(useRunsStore.getState().queue).toContain(demoId)
  expect(useRunsStore.getState().activeRunId).toBe('real-1')
  // Fim: demo completa e não rouba a run ativa.
  vi.advanceTimersByTime(30_000)
  expect(useRunsStore.getState().runs.find(r => r.id === demoId)?.status).toBe('completed')
  expect(useRunsStore.getState().queue).toContain(demoId)
  expect(useRunsStore.getState().activeRunId).toBe('real-1')
})

it('selects the demo run as active when no run is active (finish)', () => {
  runDemo()
  const demoId = useRunsStore.getState().runs[0].id
  expect(useRunsStore.getState().activeRunId).toBeNull() // ainda não selecionada
  vi.advanceTimersByTime(30_000)
  expect(useRunsStore.getState().runs.find(r => r.id === demoId)?.status).toBe('completed')
  expect(useRunsStore.getState().activeRunId).toBe(demoId)
})

it('repeated runDemo cancels previous demo timers, leaving the first run stuck (edge case)', () => {
  // Bug documentado (UX16): clearDemoTimers() cancela os eventos da demo
  // anterior em cliques repetidos → a 1ª demo nunca recebe pipeline_finished
  // e permanece 'running' para sempre. O teste pin o comportamento atual.
  // Avança 1ms entre as chamadas p/ os ids demo-<ts> não colidirem (fake timers).
  runDemo()
  const first = useRunsStore.getState().runs[0].id
  vi.advanceTimersByTime(1)
  runDemo() // segundo clique — cancela os timers da primeira
  const second = useRunsStore.getState().runs[1].id
  expect(second).not.toBe(first)
  vi.advanceTimersByTime(30_000)
  expect(useRunsStore.getState().runs.find(r => r.id === second)?.status).toBe('completed')
  expect(useRunsStore.getState().runs.find(r => r.id === first)?.status).toBe('running')
})
