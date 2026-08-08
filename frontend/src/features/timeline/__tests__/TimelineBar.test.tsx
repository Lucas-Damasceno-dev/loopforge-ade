import { render, screen, fireEvent, within } from '@testing-library/react'
import { TimelineBar } from '../TimelineBar'
import { useCanvasStore } from '../../../stores/canvasStore'

it('renders slider and back-to-live clears ghost', () => {
  useCanvasStore.setState({
    nodeStatus: { entry: { status: 'approved', attemptCount: 1 } },
    ghostToStep: 1,
  })
  render(<TimelineBar />)
  expect(screen.getByRole('slider')).toBeInTheDocument()
  // Escopado à barra: o banner de inspeção (UX6) também tem "Back to live".
  const bar = screen.getByTestId('timeline-bar')
  fireEvent.click(within(bar).getByRole('button', { name: /back to live/i }))
  expect(useCanvasStore.getState().ghostToStep).toBeNull()
})
