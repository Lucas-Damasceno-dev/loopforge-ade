import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConfig, listMcpServers, listMcpTools } from '../../shared/lib/api'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Textarea } from '../../shared/ui/Textarea'

// Playground MCP (feature #5, V1 parcial): lista servidores + tools (com badge
// de allowlist vinda do config). A rota de execução NÃO existe no V1 → botão
// "Run tool" disabled com tooltip apontando o V2.
export function McpPlayground() {
  const { data: servers = [] } = useQuery({ queryKey: ['mcp-servers'], queryFn: listMcpServers })
  const { data: config } = useQuery({ queryKey: ['mcp-config'], queryFn: getConfig })
  const [selected, setSelected] = useState<string | null>(null)
  const { data: tools = [] } = useQuery({
    queryKey: ['mcp-tools', selected],
    queryFn: () => listMcpTools(selected as string),
    enabled: selected !== null,
  })

  // Allowlist por servidor (do config) — badge "allowed"/"not allowed" por tool.
  const allowlist = config?.mcp_servers.find((s) => s.name === selected)?.tools_allowlist ?? []

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
                onClick={() => setSelected(s.name)}
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
                  <li
                    key={t.name}
                    data-testid="mcp-tool"
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5"
                  >
                    <span className="font-mono text-xs">{t.name}</span>
                    <Badge tone={allowed ? 'ok' : 'warn'}>{allowed ? 'allowed' : 'not allowed'}</Badge>
                    {t.description && <span className="truncate text-xs text-[var(--text-dim)]">{t.description}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <form className="mt-auto space-y-2" onSubmit={(e) => e.preventDefault()}>
        <Textarea
          aria-label="Tool input JSON"
          placeholder='{"key": "value"}'
          className="h-20 font-mono text-xs"
        />
        <Button variant="primary" size="sm" disabled title="Tool execution available in V2">
          Run tool
        </Button>
      </form>
    </section>
  )
}
