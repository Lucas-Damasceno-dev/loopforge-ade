import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPanel } from '../SettingsPanel'
import { getConfig, patchConfig } from '../../../shared/lib/api'
import type { AdeConfig } from '../../../shared/lib/types'

vi.mock('../../../shared/lib/api', () => ({
  getConfig: vi.fn(),
  patchConfig: vi.fn(),
}))

const CONFIG: AdeConfig = {
  budget: { max_usd: 10 },
  mcp_servers: [
    { name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], tools_allowlist: ['read'], enabled: true },
    { name: 'git', command: 'npx', args: [], tools_allowlist: [], enabled: false },
  ],
  providers: { primary: 'native', ollama_base_url: 'http://localhost:11434' },
  hitl: { timeout_seconds: 300, on_timeout: 'continue' },
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel() {
  vi.mocked(getConfig).mockResolvedValue(CONFIG)
  return render(
    <QueryClientProvider client={makeClient()}>
      <SettingsPanel open onClose={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SettingsPanel (Fase D/E9)', () => {
  it('loads config and renders budget/hitl/providers fields + server toggles', async () => {
    renderPanel()
    expect(await screen.findByLabelText('Budget max USD')).toHaveValue('10')
    expect(screen.getByLabelText('HITL timeout seconds')).toHaveValue('300')
    expect(screen.getByLabelText('HITL on timeout')).toHaveValue('continue')
    expect(screen.getByLabelText('LLM provider')).toHaveValue('native')
    expect(screen.getByLabelText('Ollama base URL')).toHaveValue('http://localhost:11434')
    expect(screen.getByText('fs')).toBeInTheDocument()
    expect(screen.getByText('git')).toBeInTheDocument()
  })

  it('saves a changed budget as a PATCH with only budget (partial)', async () => {
    vi.mocked(patchConfig).mockResolvedValue(CONFIG)
    renderPanel()
    await screen.findByLabelText('Budget max USD')
    await userEvent.clear(screen.getByLabelText('Budget max USD'))
    await userEvent.type(screen.getByLabelText('Budget max USD'), '25')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledTimes(1))
    expect(patchConfig).toHaveBeenCalledWith({ budget: { max_usd: 25 } })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('toggle MCP server sends the FULL mcp_servers list with enabled flipped', async () => {
    vi.mocked(patchConfig).mockResolvedValue(CONFIG)
    renderPanel()
    await screen.findByText('fs')
    // Toggle do server 'git' (disabled → enabled).
    const toggles = screen.getAllByRole('switch')
    await userEvent.click(toggles[1])
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledTimes(1))
    expect(patchConfig).toHaveBeenCalledWith({
      mcp_servers: [
        { name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], tools_allowlist: ['read'], enabled: true },
        { name: 'git', command: 'npx', args: [], tools_allowlist: [], enabled: true },
      ],
    })
  })

  it('hitl change sends the full hitl sub-model (replace semantics)', async () => {
    vi.mocked(patchConfig).mockResolvedValue(CONFIG)
    renderPanel()
    await screen.findByLabelText('HITL timeout seconds')
    await userEvent.selectOptions(screen.getByLabelText('HITL on timeout'), 'pause')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(patchConfig).toHaveBeenCalledWith({ hitl: { timeout_seconds: 300, on_timeout: 'pause' } }))
  })

  it('shows backend detail on 422 (role=alert) and keeps the form open', async () => {
    vi.mocked(patchConfig).mockRejectedValue(
      Object.assign(new Error('x'), { status: 422, detail: [{ loc: ['budget', 'max_usd'], msg: 'Input should be greater than or equal to 0' }] }),
    )
    renderPanel()
    await screen.findByLabelText('Budget max USD')
    await userEvent.clear(screen.getByLabelText('Budget max USD'))
    await userEvent.type(screen.getByLabelText('Budget max USD'), '30')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid configuration value (422)')
    expect(screen.getByLabelText('Budget max USD')).toHaveValue('30') // form preservado
  })

  it('Save is disabled without changes', async () => {
    renderPanel()
    await screen.findByLabelText('Budget max USD')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('shows inline hint and blocks save when budget is invalid (no fake Saved)', async () => {
    vi.mocked(patchConfig).mockResolvedValue(CONFIG)
    renderPanel()
    await screen.findByLabelText('Budget max USD')
    // Muda outro campo p/ haver mudanças (senão Save já estaria disabled).
    await userEvent.selectOptions(screen.getByLabelText('HITL on timeout'), 'pause')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
    await userEvent.clear(screen.getByLabelText('Budget max USD'))
    await userEvent.type(screen.getByLabelText('Budget max USD'), 'abc')
    expect(await screen.findByTestId('settings-budget-error')).toHaveTextContent(/must be a number/i)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(patchConfig).not.toHaveBeenCalled()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows Alert instead of infinite skeleton when getConfig fails', async () => {
    vi.mocked(getConfig).mockRejectedValue(
      Object.assign(new Error('x'), { status: 500, detail: 'backend down' }),
    )
    render(
      <QueryClientProvider client={makeClient()}>
        <SettingsPanel open onClose={() => {}} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/failed to load settings \(HTTP 500\)/i))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
