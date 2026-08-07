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
