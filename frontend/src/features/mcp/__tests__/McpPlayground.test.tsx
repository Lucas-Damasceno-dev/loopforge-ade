import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { McpPlayground } from '../McpPlayground'
import { callMcpTool } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', () => ({
  listMcpServers: vi.fn().mockResolvedValue([{ name: 'fs', status: 'running' }]),
  listMcpTools: vi.fn().mockResolvedValue([{ name: 'read', description: 'read a file' }]),
  // getConfig é consumido p/ os badges de allowlist dos tools.
  getConfig: vi.fn().mockResolvedValue({
    budget: { max_usd: 10 },
    mcp_servers: [{ name: 'fs', command: '', args: [], tools_allowlist: ['read'], enabled: true }],
    providers: { primary: 'native', ollama_base_url: 'http://localhost:11434' },
    hitl: { timeout_seconds: 300, on_timeout: 'continue' },
  }),
  callMcpTool: vi.fn(),
}))

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPlayground() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <McpPlayground />
    </QueryClientProvider>,
  )
}

async function selectServerAndTool() {
  await screen.findByText('fs')
  await userEvent.click(screen.getByRole('button', { name: /fs/i }))
  await screen.findByText('read')
  await userEvent.click(screen.getByRole('button', { name: /read/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('McpPlayground (Fase D)', () => {
  it('lists servers and tools; Run is disabled until a tool is selected', async () => {
    renderPlayground()
    await screen.findByText('fs')
    const run = screen.getByRole('button', { name: /run tool/i })
    expect(run).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /fs/i }))
    await screen.findByText('read')
    // Tool ainda não selecionada → continua disabled.
    expect(run).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /read/i }))
    expect(run).toBeEnabled()
  })

  it('runs the selected tool with empty input as {} and shows the result', async () => {
    vi.mocked(callMcpTool).mockResolvedValue({ content: 'file: /tmp/x.txt' })
    renderPlayground()
    await selectServerAndTool()
    await userEvent.click(screen.getByRole('button', { name: /run tool/i }))
    expect(callMcpTool).toHaveBeenCalledWith('fs', 'read', {})
    const result = await screen.findByTestId('mcp-result')
    expect(result).toHaveTextContent('file: /tmp/x.txt')
  })

  it('parses the arguments JSON and POSTs it', async () => {
    vi.mocked(callMcpTool).mockResolvedValue({ ok: true })
    renderPlayground()
    await selectServerAndTool()
    fireEvent.change(screen.getByLabelText('Tool input JSON'), { target: { value: '{"path": "/tmp/x.txt"}' } })
    await userEvent.click(screen.getByRole('button', { name: /run tool/i }))
    expect(callMcpTool).toHaveBeenCalledWith('fs', 'read', { path: '/tmp/x.txt' })
  })

  it('shows an inline EN error for invalid JSON and does not call the API', async () => {
    renderPlayground()
    await selectServerAndTool()
    fireEvent.change(screen.getByLabelText('Tool input JSON'), { target: { value: '{not json' } })
    await userEvent.click(screen.getByRole('button', { name: /run tool/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid JSON')
    expect(callMcpTool).not.toHaveBeenCalled()
  })

  it('shows the backend detail (PT) on 403 and keeps the error visible', async () => {
    vi.mocked(callMcpTool).mockRejectedValue(
      Object.assign(new Error('x'), { status: 403, detail: 'Tool read não permitida (allowlist do ade.yaml)' }),
    )
    renderPlayground()
    await selectServerAndTool()
    await userEvent.click(screen.getByRole('button', { name: /run tool/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('não permitida')
  })
})
