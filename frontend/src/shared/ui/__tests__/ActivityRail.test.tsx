import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ActivityRail } from '../ActivityRail'
import { VIEWS_META } from '../../lib/views'
import type { ViewKey } from '../../lib/views'

describe('ActivityRail', () => {
  it('renderiza todos os ViewKeys com aria-label', () => {
    render(<ActivityRail active={null} onSelect={() => {}} />)
    for (const key of Object.keys(VIEWS_META) as ViewKey[]) {
      expect(screen.getByRole('button', { name: VIEWS_META[key].label })).toBeInTheDocument()
    }
  })

  it('clique chama onSelect com a key', () => {
    const onSelect = vi.fn()
    render(<ActivityRail active={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Memory' }))
    expect(onSelect).toHaveBeenCalledWith('memory')
  })

  it('view ativa tem aria-pressed=true e data-active=true', () => {
    render(<ActivityRail active="memory" onSelect={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Memory' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveAttribute('data-active', 'true')
    // Não-ativa não marca.
    expect(screen.getByRole('button', { name: 'Git' })).toHaveAttribute('data-active', 'false')
  })
})
