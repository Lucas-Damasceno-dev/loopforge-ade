import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { McpPlayground } from '../McpPlayground'

vi.mock('../../../shared/lib/api', () => ({
  listMcpServers: vi.fn().mockResolvedValue([{ name: 'fs' }]),
  listMcpTools: vi.fn().mockResolvedValue([{ name: 'read' }]),
  // getConfig é consumido p/ os badges de allowlist dos tools.
  getConfig: vi.fn().mockResolvedValue({
    budget: { max_usd: 10 },
    mcp_servers: [{ name: 'fs', command: '', args: [], tools_allowlist: ['read'], enabled: true }],
    providers: {},
    hitl: {},
  }),
}))

const queryClient = new QueryClient()

it('lists servers and tools, gates Run button (V2)', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <McpPlayground />
    </QueryClientProvider>,
  )
  expect(await screen.findByText('fs')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /fs/i }))
  expect(await screen.findByText('read')).toBeInTheDocument()
  expect(screen.getByText('allowed')).toBeInTheDocument()
  const run = screen.getByRole('button', { name: /run tool/i })
  expect(run).toBeDisabled()
  expect(run).toHaveAttribute('title', 'Tool execution available in V2')
})
