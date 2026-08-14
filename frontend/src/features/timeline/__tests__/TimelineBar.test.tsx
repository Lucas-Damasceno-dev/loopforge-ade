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

it('single action collapses resume/back-to-live — label depends on state', () => {
  // Live: única ação renderizada como "Resume from here" (nunca disabled).
  useCanvasStore.setState({
    nodeStatus: { entry: { status: 'approved', attemptCount: 1 } },
    ghostToStep: null,
  })
  const { unmount } = render(<TimelineBar />)
  const resume = screen.getByRole('button', { name: /resume from here/i })
  expect(resume).toBeEnabled()
  // Colapso da dupla ação: em live não existe "Back to live".
  expect(screen.queryByRole('button', { name: /back to live/i })).not.toBeInTheDocument()
  // Clicar em live é no-op (ghost já null) — V1 sem resume no server.
  fireEvent.click(resume)
  expect(useCanvasStore.getState().ghostToStep).toBeNull()
  unmount()

  // Inspeção: a mesma ação vira "Back to live" (sem duplicata).
  useCanvasStore.setState({ ghostToStep: 1 })
  render(<TimelineBar />)
  expect(screen.queryByRole('button', { name: /resume from here/i })).not.toBeInTheDocument()
  const back = screen.getByRole('button', { name: /back to live/i })
  expect(back).toBeEnabled()
  fireEvent.click(back)
  expect(useCanvasStore.getState().ghostToStep).toBeNull()
})
