import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CostBar } from '../CostBar'

const queryClient = new QueryClient()

it('shows blocking modal at 100% and override dismisses it', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <CostBar maxUsd={10} spentUsd={10} />
    </QueryClientProvider>,
  )
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /give override/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /give override/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
