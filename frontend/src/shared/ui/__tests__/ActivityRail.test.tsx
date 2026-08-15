import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActivityRail } from '../ActivityRail'
import { VIEWS_META } from '../../lib/views'
import type { ViewKey } from '../../lib/views'
import { useAuthStore } from '../../../stores/authStore'

describe('ActivityRail', () => {
  beforeEach(() => {
    // Sem principal = auth off/demo → can() retorna true (BC admin).
    useAuthStore.setState({ principal: null })
  })

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

  it('admin (can=true) vê todas as views, incluindo mcp e settings', () => {
    render(<ActivityRail active="runs" onSelect={vi.fn()} />)
    expect(screen.getByLabelText('MCP playground')).toBeTruthy()
    expect(screen.getByLabelText('Settings')).toBeTruthy()
  })

  it('viewer (can=false p/ admin) não vê mcp nem settings', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    render(<ActivityRail active="runs" onSelect={vi.fn()} />)
    expect(screen.queryByLabelText('MCP playground')).toBeNull()
    expect(screen.queryByLabelText('Settings')).toBeNull()
    expect(screen.getByLabelText('Runs')).toBeTruthy()
  })
})
