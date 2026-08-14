import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { IconTabBar } from '../IconTabBar'

// Barra de tabs ícone-only (T6): aria-label, badge de count, clique e estado
// ativo (aria-pressed) — contrato do brief da task.
describe('IconTabBar', () => {
  it('renderiza items com aria-label', () => {
    render(
      <IconTabBar
        items={[
          { key: 'console', label: 'Console', icon: 'console', onClick: vi.fn() },
          { key: 'terminal', label: 'Terminal', icon: 'terminal', onClick: vi.fn() },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Console' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeInTheDocument()
  })

  it('mostra badge de count apenas quando > 0', () => {
    render(
      <IconTabBar
        items={[
          { key: 'console', label: 'Console', icon: 'console', count: 3, onClick: vi.fn() },
          { key: 'terminal', label: 'Terminal', icon: 'terminal', count: 0, onClick: vi.fn() },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Console' }).textContent).toContain('3')
    expect(screen.getByRole('tab', { name: 'Terminal' }).textContent).not.toContain('0')
  })

  it('clique chama onClick do item', () => {
    const onClick = vi.fn()
    render(<IconTabBar items={[{ key: 'console', label: 'Console', icon: 'console', onClick }]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Console' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('item ativo tem aria-pressed=true (inativo false)', () => {
    render(
      <IconTabBar
        items={[
          { key: 'console', label: 'Console', icon: 'console', active: true, onClick: vi.fn() },
          { key: 'terminal', label: 'Terminal', icon: 'terminal', onClick: vi.fn() },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'false')
  })
})
