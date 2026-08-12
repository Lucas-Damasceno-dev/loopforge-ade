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
  // Escopado à barra: o "Back to live" vive só na barra flutuante (o banner
  // fixo de inspeção foi removido — sem duplicação).
  const bar = screen.getByTestId('timeline-bar')
  fireEvent.click(within(bar).getByRole('button', { name: /back to live/i }))
  expect(useCanvasStore.getState().ghostToStep).toBeNull()
})

it('resume-from-here renders only while inspecting and is never disabled', () => {
  // Live: botão ausente (não existe disabled permanente).
  useCanvasStore.setState({
    nodeStatus: { entry: { status: 'approved', attemptCount: 1 } },
    ghostToStep: null,
  })
  const { unmount } = render(<TimelineBar />)
  expect(screen.queryByRole('button', { name: /resume from here/i })).not.toBeInTheDocument()
  unmount()

  // Inspeção: botão habilitado; clicar retorna à visualização live (V1).
  useCanvasStore.setState({ ghostToStep: 1 })
  render(<TimelineBar />)
  const resume = screen.getByRole('button', { name: /resume from here/i })
  expect(resume).toBeEnabled()
  fireEvent.click(resume)
  expect(useCanvasStore.getState().ghostToStep).toBeNull()
})
