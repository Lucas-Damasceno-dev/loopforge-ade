import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { McpPlayground } from '../McpPlayground'
import { callMcpTool, getConfig, listMcpTools, patchConfig } from '../../../shared/lib/api'
import type { AdeConfig } from '../../../shared/lib/types'

// Config realista (espelha ade.yaml): fs habilitado com allowlist ['read'],
// git desabilitado com allowlist vazia.
const CONFIG: AdeConfig = {
  budget: { max_usd: 10 },
  mcp_servers: [
    {
      name: 'fs',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      tools_allowlist: ['read'],
      enabled: true,
    },
    { name: 'git', command: 'npx', args: [], tools_allowlist: [], enabled: false },
  ],
  providers: { primary: 'native', ollama_base_url: 'http://localhost:11434' },
  hitl: { timeout_seconds: 300, on_timeout: 'continue' },
}

vi.mock('../../../shared/lib/api', () => ({
  listMcpServers: vi.fn().mockResolvedValue([
    { name: 'fs', status: 'running' },
    { name: 'git', status: 'stopped' },
  ]),
  listMcpTools: vi.fn().mockResolvedValue([{ name: 'read', description: 'read a file' }]),
  // getConfig é consumido p/ os badges de allowlist dos tools e o estado
  // enabled dos servidores. Lazy (mockImplementation) por causa do hoisting
  // do vi.mock acima do const CONFIG.
  getConfig: vi.fn().mockImplementation(() => Promise.resolve(CONFIG)),
  callMcpTool: vi.fn(),
  patchConfig: vi.fn().mockImplementation(() => Promise.resolve(CONFIG)),
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
  await screen.findAllByTestId('mcp-server')
  await userEvent.click(screen.getAllByTestId('mcp-server')[0]!)
  await screen.findByText('read')
  await userEvent.click(screen.getByTestId('mcp-tool'))
}

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks NÃO zera implementations — restaura a base para que
  // overrides de testes anteriores (mockResolvedValue) não vazem.
  vi.mocked(getConfig).mockImplementation(() => Promise.resolve(CONFIG))
  vi.mocked(patchConfig).mockImplementation(() => Promise.resolve(CONFIG))
})

describe('McpPlayground (Fase D + deny-by-default)', () => {
  it('lists servers and tools; Run is disabled until a tool is selected', async () => {
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    const run = screen.getByRole('button', { name: /run tool/i })
    expect(run).toBeDisabled()
    await userEvent.click(screen.getAllByTestId('mcp-server')[0]!)
    await screen.findByText('read')
    // Tool ainda não selecionada → continua disabled.
    expect(run).toBeDisabled()
    await userEvent.click(screen.getByTestId('mcp-tool'))
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

  // ─── deny-by-default (allowlist) ─────────────────────────────────────────

  it('empty allowlist shows every tool as "not allowed" (deny-by-default)', async () => {
    vi.mocked(getConfig).mockResolvedValue({
      ...CONFIG,
      mcp_servers: [{ ...CONFIG.mcp_servers[0]!, tools_allowlist: [] }, CONFIG.mcp_servers[1]!],
    })
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    await userEvent.click(screen.getAllByTestId('mcp-server')[0]!)
    await screen.findByText('read')
    expect(screen.getByText('not allowed')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /allow tool read/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggle ON adds the tool to the allowlist and persists the full server list', async () => {
    vi.mocked(getConfig).mockResolvedValue({
      ...CONFIG,
      mcp_servers: [{ ...CONFIG.mcp_servers[0]!, tools_allowlist: [] }, CONFIG.mcp_servers[1]!],
    })
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    await userEvent.click(screen.getAllByTestId('mcp-server')[0]!)
    await screen.findByText('read')
    await userEvent.click(screen.getByRole('switch', { name: /allow tool read/i }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledTimes(1))
    expect(patchConfig).toHaveBeenCalledWith({
      mcp_servers: [
        {
          name: 'fs',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          tools_allowlist: ['read'],
          enabled: true,
        },
        CONFIG.mcp_servers[1],
      ],
    })
  })

  it('toggle OFF removes the tool from the allowlist', async () => {
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    await userEvent.click(screen.getAllByTestId('mcp-server')[0]!)
    await screen.findByText('read')
    await userEvent.click(screen.getByRole('switch', { name: /allow tool read/i }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledTimes(1))
    expect(patchConfig).toHaveBeenCalledWith({
      mcp_servers: [
        {
          name: 'fs',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          tools_allowlist: [],
          enabled: true,
        },
        CONFIG.mcp_servers[1],
      ],
    })
  })

  // ─── add/remove server (E9 override pela UI) ─────────────────────────────

  it('adds a new server via the form and persists the full list', async () => {
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))
    await userEvent.type(screen.getByLabelText('Server name'), 'db')
    await userEvent.type(screen.getByLabelText('Server command'), 'npx')
    await userEvent.type(screen.getByLabelText('Server args'), '-y @modelcontextprotocol/server-postgres')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledTimes(1))
    expect(patchConfig).toHaveBeenCalledWith({
      mcp_servers: [
        ...CONFIG.mcp_servers,
        { name: 'db', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'], tools_allowlist: [], enabled: true },
      ],
    })
  })

  it('rejects add without name/command with an inline error', async () => {
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))
    await userEvent.type(screen.getByLabelText('Server name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server name and command are required')
    expect(patchConfig).not.toHaveBeenCalled()
  })

  it('removes a server and persists the list without it', async () => {
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    await userEvent.click(screen.getByRole('button', { name: 'Remove fs' }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledTimes(1))
    expect(patchConfig).toHaveBeenCalledWith({ mcp_servers: [CONFIG.mcp_servers[1]] })
  })

  // ─── estado enabled ──────────────────────────────────────────────────────

  it('marks disabled servers and does not fetch tools for them', async () => {
    renderPlayground()
    await screen.findAllByTestId('mcp-server')
    expect(screen.getByText('disabled')).toBeInTheDocument()
    // git é o 2º servidor (fs + git) — seleciona via testid, não por nome
    // (evita ambiguidade com o botão "Remove git").
    await userEvent.click(screen.getAllByTestId('mcp-server')[1]!)
    expect(await screen.findByText(/Server is disabled in ade.yaml/)).toBeInTheDocument()
    expect(listMcpTools).not.toHaveBeenCalled()
  })
})
