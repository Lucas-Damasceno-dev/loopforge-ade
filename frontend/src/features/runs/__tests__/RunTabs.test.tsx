import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunTabs } from '../RunTabs'
import type { Run } from '../../../shared/lib/types'
import type { CbSnapshot } from '../../../stores/runsStore'

function run(status: Run['status'], id = 'r1'): Run {
  return { id, idea: 'x', stack: '', status }
}

function renderTabs(runs: Run[], cbByRun: Record<string, CbSnapshot> = {}) {
  render(<RunTabs runs={runs} activeRunId={runs[0]?.id ?? null} queue={[]} cbByRun={cbByRun} onSelect={vi.fn()} onClose={vi.fn()} />)
}

describe('RunTabs status badge', () => {
  it('shows EN label for queued (info) and paused (warn) run statuses', () => {
    renderTabs([run('queued', 'r1'), run('paused', 'r2')])
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })
  it('keeps existing status labels unchanged', () => {
    renderTabs([run('completed', 'r1'), run('failed', 'r2')])
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })
  it('shows degraded badge (warn) with reason title when run.degraded', () => {
    const d: Run = { ...run('running', 'r1'), degraded: true, degraded_reason: 'mock fallback' }
    renderTabs([d])
    expect(screen.getByText('degraded')).toBeInTheDocument()
    expect(screen.getByTitle('mock fallback')).toBeInTheDocument()
  })
  it('shows no degraded badge when run is not degraded', () => {
    renderTabs([run('running', 'r1')])
    expect(screen.queryByText('degraded')).not.toBeInTheDocument()
  })
  it('shows CB badge (open) when cbByRun has the run', () => {
    renderTabs([run('running', 'r1')], { r1: { state: 'open', total_iterations: 20, total_cost: 2.5 } })
    expect(screen.getByText('O')).toBeInTheDocument()
    expect(screen.getByTitle('circuit breaker open · iters 20 · $2.50')).toBeInTheDocument()
  })
  it('shows no CB badge when cbByRun lacks the run', () => {
    renderTabs([run('running', 'r1')], {})
    expect(screen.queryByTitle(/circuit breaker/)).not.toBeInTheDocument()
  })
})
