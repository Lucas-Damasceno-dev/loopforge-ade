import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { callMcpTool, getConfig, listMcpServers, listMcpTools, patchConfig } from '../../shared/lib/api'
import type { AdeMcpServer } from '../../shared/lib/types'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { Toggle } from '../../shared/ui/Toggle'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'

// Erros da API de execução (Fase D/UC-05). O detail do backend é exibido como
// veio (PT), sem tradução; fallback EN por status quando não há detail.
interface ApiLikeError {
  status: number
  detail: unknown
}
function isApiError(e: unknown): e is ApiLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    'detail' in e
  )
}
function toolErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (typeof e.detail === 'string' && e.detail.trim().length > 0) return e.detail
    switch (e.status) {
      case 403: return 'Tool not allowed (allowlist in ade.yaml)'
      case 404: return 'MCP server not found'
      case 503: return 'MCP server not connected'
      default: return `API error ${e.status}`
    }
  }
  return e instanceof Error && e.message ? e.message : 'Failed to run tool'
}

// Playground MCP (Fase D + deny-by-default): lista servidores + tools,
// EXECUTA tools via POST /mcp/servers/{name}/tools/{tool} (body {arguments}) e
// GERENCIA a allowlist deny-by-default do ade.yaml (toggle por tool + add/remove
// server, persistidos via PATCH /config com a lista completa de servidores —
// semântica de replace do backend). Badge "allowed"/"not allowed" espelha a
// allowlist REAL: vazia = tudo negado (deny-by-default), igual ao registry.
export function McpPlayground() {
  const queryClient = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['mcp-servers'], queryFn: listMcpServers })
  const { data: config } = useQuery({ queryKey: ['mcp-config'], queryFn: getConfig })
  const [selected, setSelected] = useState<string | null>(null)
  const selectedServer = config?.mcp_servers.find((s) => s.name === selected)
  const serverDisabled = selectedServer?.enabled === false
  const { data: tools = [] } = useQuery({
    queryKey: ['mcp-tools', selected],
    queryFn: () => listMcpTools(selected as string),
    enabled: selected !== null && !serverDisabled,
  })

  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [argsText, setArgsText] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  // Gestão da allowlist (deny-by-default): toggle por tool + add/remove server.
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [showAddServer, setShowAddServer] = useState(false)
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '' })

  // Allowlist por servidor (do config) — badge "allowed"/"not allowed" por tool.
  const allowlist = selectedServer?.tools_allowlist ?? []
  const canRun = selected !== null && selectedTool !== null && !serverDisabled

  // PATCH /config com a lista COMPLETA de servidores (command/args/allowlist/
  // enabled preservados — o backend valida list[AdeMcpServer] inteira).
  const persistServers = async (nextServers: AdeMcpServer[]): Promise<boolean> => {
    setSavingConfig(true)
    try {
      const saved = await patchConfig({ mcp_servers: nextServers })
      queryClient.setQueryData(['mcp-config'], saved)
      // Refetch do status dos servidores (add/remove/toggle mudam a lista).
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setConfigError(null)
      return true
    } catch (e) {
      setConfigError(toolErrorMessage(e))
      return false
    } finally {
      setSavingConfig(false)
    }
  }

  const selectServer = (name: string) => {
    setSelected(name)
    setSelectedTool(null) // tools pertencem ao servidor — reset ao trocar
    setResult(null)
    setArgsText('')
    setError(null)
    setConfigError(null)
  }

  const toggleToolAllowed = async (toolName: string) => {
    if (!config || !selectedServer) return
    const has = selectedServer.tools_allowlist.includes(toolName)
    const nextAllowlist = has
      ? selectedServer.tools_allowlist.filter((n) => n !== toolName)
      : [...selectedServer.tools_allowlist, toolName]
    await persistServers(
      config.mcp_servers.map((s) =>
        s.name === selectedServer.name ? { ...s, tools_allowlist: nextAllowlist } : s,
      ),
    )
  }

  const addServer = async () => {
    if (!config) return
    const name = newServer.name.trim()
    const command = newServer.command.trim()
    if (name === '' || command === '') {
      setConfigError('Server name and command are required')
      return
    }
    if (config.mcp_servers.some((s) => s.name === name)) {
      setConfigError(`Server "${name}" already exists in ade.yaml`)
      return
    }
    const args = newServer.args.trim().split(/\s+/).filter(Boolean)
    const ok = await persistServers([
      ...config.mcp_servers,
      { name, command, args, tools_allowlist: [], enabled: true },
    ])
    if (ok) {
      setNewServer({ name: '', command: '', args: '' })
      setShowAddServer(false)
    }
  }

  const removeServer = async (name: string) => {
    if (!config) return
    const ok = await persistServers(config.mcp_servers.filter((s) => s.name !== name))
    if (ok && selected === name) {
      setSelected(null)
      setSelectedTool(null)
      setResult(null)
    }
  }

  const runTool = async () => {
    if (!selected || !selectedTool) return
    const trimmed = argsText.trim()
    let args: Record<string, unknown>
    if (trimmed === '') {
      args = {} // input vazio → {} (contrato do body)
    } else {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
        args = parsed as Record<string, unknown>
      } catch {
        setError('Invalid JSON — expected an object of arguments')
        return
      }
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await callMcpTool(selected, selectedTool, args)
      setResult(res)
    } catch (e) {
      setError(toolErrorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section data-testid="mcp-playground" className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)]">MCP servers</h2>
        <Button variant="subtle" size="sm" onClick={() => setShowAddServer((v) => !v)}>
          {showAddServer ? 'Cancel' : 'Add server'}
        </Button>
      </div>
      {configError && (
        <Alert tone="err">{configError}</Alert>
      )}
      {showAddServer && (
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] p-2" data-testid="mcp-add-server">
          <Input
            aria-label="Server name"
            placeholder="name (e.g. fs)"
            value={newServer.name}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
            disabled={savingConfig}
          />
          <Input
            aria-label="Server command"
            placeholder="command (e.g. npx)"
            value={newServer.command}
            onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
            disabled={savingConfig}
          />
          <Input
            aria-label="Server args"
            placeholder="args (space separated, optional)"
            value={newServer.args}
            onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
            disabled={savingConfig}
          />
          <Button variant="primary" size="sm" onClick={addServer} disabled={savingConfig}>
            Add
          </Button>
        </div>
      )}
      {servers.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)]">No MCP servers available</p>
      ) : (
        <ul className="space-y-1">
          {servers.map((s) => {
            const isDisabled = config?.mcp_servers.find((c) => c.name === s.name)?.enabled === false
            return (
              <li key={s.name} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => selectServer(s.name)}
                  aria-pressed={selected === s.name}
                  data-testid="mcp-server"
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${
                    selected === s.name
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] bg-[var(--bg-elev)]'
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  {isDisabled && <Badge tone="warn">disabled</Badge>}
                  {s.status && !isDisabled && <Badge tone={s.status === 'running' ? 'ok' : 'neutral'}>{s.status}</Badge>}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => removeServer(s.name)}
                  disabled={savingConfig}
                  className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-dim)] hover:border-[var(--err)] hover:text-[var(--err-text)] disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && (
        <>
          <SectionTitle>Tools ({selected})</SectionTitle>
          {serverDisabled ? (
            <p className="text-sm text-[var(--text-dim)]">
              Server is disabled in ade.yaml — enable it to browse and run its tools.
            </p>
          ) : tools.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No tools</p>
          ) : (
            <ul className="space-y-1">
              {tools.map((t) => {
                // Deny-by-default: allowed somente se presente na allowlist
                // (allowlist vazia = tudo negado — espelha o registry).
                const allowed = allowlist.includes(t.name)
                return (
                  <li key={t.name} className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)]">
                    <button
                      type="button"
                      onClick={() => { setSelectedTool(t.name); setResult(null); setError(null) }}
                      aria-pressed={selectedTool === t.name}
                      data-testid="mcp-tool"
                      className={`flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-left ${
                        selectedTool === t.name
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                          : 'hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <span className="font-mono text-xs">{t.name}</span>
                      <Badge tone={allowed ? 'ok' : 'warn'}>{allowed ? 'allowed' : 'not allowed'}</Badge>
                      {t.description && <span className="truncate text-xs text-[var(--text-dim)]">{t.description}</span>}
                    </button>
                    <Toggle
                      checked={allowed}
                      onChange={() => toggleToolAllowed(t.name)}
                      label={`Allow tool ${t.name}`}
                      disabled={savingConfig}
                      className="shrink-0 pr-1"
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <form
        className="mt-auto space-y-2"
        onSubmit={(e) => { e.preventDefault(); runTool() }}
      >
        {selected && (
          <p className="text-xs text-[var(--text-dim)]">
            {selectedTool ? (
              <>Running <span className="font-mono text-[var(--text)]">{selectedTool}</span> on{' '}
                <span className="font-mono text-[var(--text)]">{selected}</span></>
            ) : (
              'Select a tool to run it'
            )}
          </p>
        )}
        <Textarea
          aria-label="Tool input JSON"
          placeholder='{"key": "value"}'
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          disabled={!canRun}
          className="h-20 font-mono text-xs"
        />
        {error && (
          <Alert tone="err">{error}</Alert>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={!canRun || running}
          title={canRun ? undefined : 'Select a server and a tool to run it'}
          onClick={runTool}
        >
          {running ? 'Running…' : 'Run tool'}
        </Button>
      </form>

      {result && (
        <div className="min-h-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Result</p>
          <pre
            data-testid="mcp-result"
            className="max-h-48 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[11px] leading-5 text-[var(--text)]"
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </section>
  )
}
