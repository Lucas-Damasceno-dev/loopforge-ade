import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { SplitPane } from '../SplitPane'
import { EmptyState } from '../EmptyState'

describe('ui-kit', () => {
  it('Button renders label and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Run demo</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Run demo' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
  it('Drawer opens non-modal and closes on Esc', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<Drawer open={false} title="Inspect" onClose={onClose}><p>payload</p></Drawer>)
    expect(screen.queryByText('payload')).not.toBeInTheDocument()
    rerender(<Drawer open title="Inspect" onClose={onClose}><p>payload</p></Drawer>)
    expect(screen.getByText('payload')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
  it('Drawer is non-modal: aria-modal=false', () => {
    render(<Drawer open title="Inspect" onClose={() => {}}><p>payload</p></Drawer>)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false')
  })
  it('SplitPane divider drag resizes pane A', () => {
    render(
      <SplitPane direction="horizontal" initialSize={200} minSize={100}>
        <div>pane a</div><div>pane b</div>
      </SplitPane>,
    )
    const divider = screen.getByRole('separator')
    fireEvent.pointerDown(divider, { clientX: 200 })
    fireEvent.pointerMove(window, { clientX: 250 })
    fireEvent.pointerUp(window)
    // pane A é envolvido por um wrapper com o flexBasis → asserção no wrapper.
    expect(screen.getByText('pane a').parentElement).toHaveStyle({ flexBasis: '250px' })
  })
  it('EmptyState default usa py-12; compact usa py-6 e título sm', () => {
    const { rerender } = render(<EmptyState title="vazio" />)
    expect(screen.getByText('vazio').parentElement?.className).toContain('py-12')
    rerender(<EmptyState title="vazio" compact />)
    expect(screen.getByText('vazio').parentElement?.className).toContain('py-6')
    expect(screen.getByText('vazio').className).toContain('text-sm')
  })
})
