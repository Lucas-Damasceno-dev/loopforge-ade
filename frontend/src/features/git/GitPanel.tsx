import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGitInfo, publishGitPr, ApiError } from '../../shared/lib/api'
import type { GitInfo } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Card } from '../../shared/ui/Card'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Button } from '../../shared/ui/Button'
import { showToast } from '../../stores/toastStore'

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

// Erro de load honesto: loga detail verbatim (PT do backend), mostra EN com o
// status HTTP real — não afirma "no git repository" para 500/network.
function gitErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (typeof e.detail === 'string' && e.detail.trim().length > 0) {
      console.error('Git info request failed:', e.detail)
    }
    return `Failed to load git info (HTTP ${e.status})`
  }
  return e instanceof Error && e.message ? e.message : 'No git repository for this run'
}

export function GitPanel({ open, onClose, runId }: GitPanelProps) {
  return (
    <Drawer open={open} title="Git" onClose={onClose}>
      <GitPanelContent runId={runId} enabled={open} />
    </Drawer>
  )
}

// Conteúdo inline (T3 — sub-sidebar): mesma UI do drawer, sem wrapper.
// `enabled` liga a query só quando o painel/sidebar está ativo.
export function GitPanelContent({ runId, enabled = true }: { runId: string; enabled?: boolean }) {
  const [isPublishing, setIsPublishing] = useState(false)
  const [prFeedback, setPrFeedback] = useState<{ tone: 'ok' | 'err'; message: string } | null>(null)

  const gitQuery = useQuery<GitInfo>({
    queryKey: ['git-info', runId],
    queryFn: () => getGitInfo(runId),
    enabled: enabled && runId.length > 0,
  })

  const info = gitQuery.data

  const handlePublishPr = async () => {
    setIsPublishing(true)
    setPrFeedback(null)
    try {
      const res = await publishGitPr(runId)
      if (res.success) {
        setPrFeedback({ tone: 'ok', message: res.message || 'Pull Request published successfully!' })
        showToast('Pull Request Published', res.message || 'Branch created and PR opened on GitHub', 'ok')
        gitQuery.refetch()
      } else {
        setPrFeedback({ tone: 'err', message: res.message || 'Failed to publish Pull Request.' })
        showToast('PR Publication Failed', res.message, 'err')
      }
    } catch (err) {
      setPrFeedback({ tone: 'err', message: String(err) })
      showToast('Error Publishing PR', String(err), 'err')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <>
      {runId.length === 0 ? (
        <EmptyState
          title="No active run"
          description="Select one from Runs to inspect its repository state."
        />
      ) : gitQuery.isLoading ? (
        <p className="text-sm text-[var(--text-dim)]">Loading git info…</p>
      ) : gitQuery.isError ? (
        <Alert tone="err">{gitErrorMessage(gitQuery.error)}</Alert>
      ) : info ? (
        <div className="space-y-5">
          {prFeedback && (
            <Alert tone={prFeedback.tone}>
              {prFeedback.message}
            </Alert>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Repository</SectionTitle>
              <Button
                size="sm"
                variant="primary"
                disabled={isPublishing}
                onClick={handlePublishPr}
              >
                {isPublishing ? 'Publishing…' : 'Publish as PR'}
              </Button>
            </div>
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
              <div className="relative border-l border-[var(--border)] ml-2.5 pl-4 space-y-3">
                {info.log.map((entry, idx) => (
                  <div
                    key={entry.hash}
                    data-testid={`git-log-${entry.hash}`}
                    className="relative rounded-md border border-[var(--border)] bg-[var(--bg-elev)]/80 p-2.5 transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)]"
                  >
                    {/* Timeline dot */}
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)] ${
                        idx === 0 ? 'bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]' : 'bg-[var(--border)]'
                      }`}
                    />
                    <p className="font-mono text-xs text-[var(--text)]">
                      <span className="font-semibold text-[var(--accent-text)]">{entry.hash}</span>{' '}
                      <span className="text-[var(--text)]">{entry.subject}</span>
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-[var(--text-dim)]">
                      {entry.author} · {entry.when}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p data-testid="git-log-empty" className="text-sm text-[var(--text-dim)]">No commits yet</p>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
