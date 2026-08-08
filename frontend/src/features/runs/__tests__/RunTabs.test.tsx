import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunTabs } from '../RunTabs'
import type { Run } from '../../../shared/lib/types'

function run(status: Run['status'], id = 'r1'): Run {
  return { id, idea: 'x', stack: '', status }
}

describe('RunTabs status badge', () => {
  it('shows PT label for queued (info) and paused (warn) run statuses', () => {
    render(<RunTabs runs={[run('queued', 'r1'), run('paused', 'r2')]} activeRunId="r1" queue={[]} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Na fila')).toBeInTheDocument()
    expect(screen.getByText('Pausada')).toBeInTheDocument()
  })
  it('keeps existing status labels unchanged', () => {
    render(<RunTabs runs={[run('completed', 'r1'), run('failed', 'r2')]} activeRunId="r1" queue={[]} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })
})
