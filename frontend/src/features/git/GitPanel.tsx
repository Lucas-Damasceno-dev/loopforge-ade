import { useQuery } from '@tanstack/react-query'
import { getGitInfo } from '../../shared/lib/api'
import type { GitInfo } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Card } from '../../shared/ui/Card'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'

// Git (Tier2 — GitPanel): estado do repositório da run ativa — branch/HEAD no
// topo, lista de arquivos alterados (status curto estilo git status --short)
// e log de commits (máx. 20). Query dispara só com o drawer aberto + runId.
// Drawer não-modal (mesmo padrão do EvalsPanel/SettingsPanel). UI strings EN
// (E8), comentários PT.

interface GitPanelProps {
  open: boolean
  onClose: () => void
  runId: string
}

// Código curto de status → tom do badge (aproximação do vocabulário do git).
function statusTone(status: string): string {
  const code = status[0] ?? '?'
  if (code === '?') return 'bg-[var(--info)]/15 text-[var(--info-text)]'
  if (code === 'M') return 'bg-[var(--warn)]/15 text-[var(--warn-text)]'
  if (code === 'D') return 'bg-[var(--err)]/15 text-[var(--err-text)]'
  return 'bg-[var(--ok)]/15 text-[var(--ok-text)]'
}

export function GitPanel({ open, onClose, runId }: GitPanelProps) {
  const gitQuery = useQuery<GitInfo>({
    queryKey: ['git-info', runId],
    queryFn: () => getGitInfo(runId),
    enabled: open && runId.length > 0,
  })

  const info = gitQuery.data

  return (
    <Drawer open={open} title="Git" onClose={onClose}>
      {gitQuery.isLoading ? (
        <p className="text-sm text-[var(--text-dim)]">Loading git info…</p>
      ) : gitQuery.isError ? (
        <Alert tone="err">No git repository for this run</Alert>
      ) : info ? (
        <div className="space-y-5">
          <section>
            <SectionTitle className="mb-2">Repository</SectionTitle>
            <Card className="space-y-1 font-mono text-xs">
              <p data-testid="git-branch" className="text-[var(--text)]">
                <span className="text-[var(--text-dim)]">branch </span>
                {info.branch ?? '—'}
              </p>
              <p data-testid="git-head" className="text-[var(--text)]">
                <span className="text-[var(--text-dim)]">head </span>
                {info.head ?? '—'}
              </p>
            </Card>
          </section>

          <section>
            <SectionTitle className="mb-2">Status</SectionTitle>
            {info.status.length > 0 ? (
              <ul className="space-y-1.5">
                {info.status.map((entry) => (
                  <li
                    key={entry.path}
                    data-testid={`git-status-${entry.path}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate font-mono text-xs text-[var(--text)]">{entry.path}</span>
                    <span className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold ${statusTone(entry.status)}`}>
                      {entry.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="git-status-clean" className="text-sm text-[var(--text-dim)]">Clean working tree</p>
            )}
          </section>

          <section>
            <SectionTitle className="mb-2">Log</SectionTitle>
            {info.log.length > 0 ? (
              <ul className="space-y-1.5">
                {info.log.map((entry) => (
                  <li
                    key={entry.hash}
                    data-testid={`git-log-${entry.hash}`}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5"
                  >
                    <p className="font-mono text-xs text-[var(--text)]">
                      <span className="text-[var(--accent-text)]">{entry.hash}</span>{' '}
                      <span className="text-[var(--text-dim)]">{entry.subject}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-dim)]">
                      {entry.author} · {entry.when}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="git-log-empty" className="text-sm text-[var(--text-dim)]">No commits yet</p>
            )}
          </section>
        </div>
      ) : null}
    </Drawer>
  )
}
