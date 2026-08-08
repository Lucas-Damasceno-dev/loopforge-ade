import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { callMcpTool, getConfig, listMcpServers, listMcpTools } from '../../shared/lib/api'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Textarea } from '../../shared/ui/Textarea'

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

// Playground MCP (Fase D): lista servidores + tools (badge de allowlist do
// config) e EXECUTA tools de verdade via POST /mcp/servers/{name}/tools/{tool}
// (body {arguments}). Selecionar uma tool habilita o form — JSON inválido dá
// erro inline EN; resultado pretty-printed em code block; erros 403/503/404
// exibem o detail do backend (PT como veio) em tom de erro.
export function McpPlayground() {
  const { data: servers = [] } = useQuery({ queryKey: ['mcp-servers'], queryFn: listMcpServers })
  const { data: config } = useQuery({ queryKey: ['mcp-config'], queryFn: getConfig })
  const [selected, setSelected] = useState<string | null>(null)
  const { data: tools = [] } = useQuery({
    queryKey: ['mcp-tools', selected],
    queryFn: () => listMcpTools(selected as string),
    enabled: selected !== null,
  })

  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [argsText, setArgsText] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  // Allowlist por servidor (do config) — badge "allowed"/"not allowed" por tool.
  const allowlist = config?.mcp_servers.find((s) => s.name === selected)?.tools_allowlist ?? []
  const canRun = selected !== null && selectedTool !== null

  const selectServer = (name: string) => {
    setSelected(name)
    setSelectedTool(null) // tools pertencem ao servidor — reset ao trocar
    setResult(null)
    setArgsText('')
    setError(null)
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
      <h2 className="text-sm font-semibold text-[var(--text)]">MCP servers</h2>
      {servers.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)]">No MCP servers available</p>
      ) : (
        <ul className="space-y-1">
          {servers.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => selectServer(s.name)}
                aria-pressed={selected === s.name}
                className={`w-full rounded-md border px-3 py-1.5 text-left text-sm ${
                  selected === s.name
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--border)] bg-[var(--bg-elev)]'
                }`}
              >
                <span className="font-medium">{s.name}</span>
                {s.status && <Badge tone={s.status === 'running' ? 'ok' : 'neutral'}>{s.status}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">
            Tools ({selected})
          </h3>
          {tools.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No tools</p>
          ) : (
            <ul className="space-y-1">
              {tools.map((t) => {
                const allowed = allowlist.length === 0 || allowlist.includes(t.name)
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => { setSelectedTool(t.name); setResult(null); setError(null) }}
                      aria-pressed={selectedTool === t.name}
                      data-testid="mcp-tool"
                      className={`flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left ${
                        selectedTool === t.name
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                          : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <span className="font-mono text-xs">{t.name}</span>
                      <Badge tone={allowed ? 'ok' : 'warn'}>{allowed ? 'allowed' : 'not allowed'}</Badge>
                      {t.description && <span className="truncate text-xs text-[var(--text-dim)]">{t.description}</span>}
                    </button>
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
          <p role="alert" className="rounded-md border border-[var(--err)]/30 bg-[var(--err)]/15 px-2 py-1.5 text-xs text-[var(--err-text)]">
            {error}
          </p>
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
