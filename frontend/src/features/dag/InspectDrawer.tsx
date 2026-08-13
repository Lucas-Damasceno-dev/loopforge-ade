import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatusEntry } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { useConsoleStore } from '../../stores/consoleStore'
import { getRunArtifacts } from '../../shared/lib/api'
import type { ArtifactsResponse, CircuitBreakerSnapshot } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Badge } from '../../shared/ui/Badge'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { NODE_LABELS } from './dagModel'
import { nodeAccentTextVar } from './nodeAccent'
import { NODE_STATUS_LABEL, NODE_STATUS_TONE } from './nodeStatusMeta'

const DEFAULT_ENTRY: NodeStatusEntry = { status: 'pending', attemptCount: 0 }
const PAYLOAD_TRUNC = 2000

// Severidade de vulnerabilidade → tone do Badge.
const SEVERITY_TONE: Record<string, 'err' | 'warn' | 'neutral'> = {
  critical: 'err',
  high: 'err',
  medium: 'warn',
  low: 'neutral',
  info: 'neutral',
}

// Drawer de inspeção (UX8): abre com um nó selecionado no canvas.
// Dados REAIS via GET /runs/{id}/artifacts (outputs do nó, tokens por nó,
// audit AppSec/DevOps, degraded/circuit breaker); logs seguem do console.
export function InspectDrawer() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  const selectNode = useCanvasStore((s) => s.selectNode)
  const entries = useConsoleStore((s) => s.entries)
  const activeRunId = useRunsStore((s) => s.activeRunId)

  const open = selectedNodeId !== null
  const node = selectedNodeId as NonNullable<typeof selectedNodeId> | null

  const { data: artifacts } = useQuery<ArtifactsResponse>({
    queryKey: ['run-artifacts', activeRunId],
    queryFn: () => getRunArtifacts(activeRunId as string),
    enabled: open && !!activeRunId,
    staleTime: 5000,
  })

  const label = node ? NODE_LABELS[node as keyof typeof NODE_LABELS] ?? node : ''
  const entry = (node ? nodeStatus[node as keyof typeof nodeStatus] : undefined) ?? DEFAULT_ENTRY
  const nodeLogs = node ? entries.filter((e) => e.node === node) : []
  const nodeArtifact = node ? artifacts?.node_artifacts[node] : undefined

  // Output serializado (truncado com toggle quando grande).
  const rawOutput = nodeArtifact ? JSON.stringify(nodeArtifact.output, null, 2) : null
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setExpanded(false) }, [node])
  const truncated = rawOutput !== null && rawOutput.length > PAYLOAD_TRUNC && !expanded
  const shownOutput = truncated ? `${rawOutput.slice(0, PAYLOAD_TRUNC)}\n… (truncated)` : rawOutput

  const nodeTokens = node ? artifacts?.tokens.filter((t) => t.node === node) ?? [] : []

  const titleStyle = node ? { color: nodeAccentTextVar(node as keyof typeof nodeAccentTextVar) } : undefined

  const secReview = nodeArtifact?.output.security_review as
    | { vulnerabilities_found?: { severity?: string; type?: string; description?: string }[] }
    | undefined
  const devopsManifest = nodeArtifact?.output.devops_manifest as
    | { deployability_score?: number; status?: string; dockerfile_created?: boolean; ci_workflow_created?: boolean; recommendations?: string[] }
    | undefined

  const cb: CircuitBreakerSnapshot | null = artifacts?.circuit_breaker ?? null

  return (
    <Drawer open={open} title={label} onClose={() => selectNode(null)} titleStyle={titleStyle}>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Badge tone={NODE_STATUS_TONE[entry.status]}>{NODE_STATUS_LABEL[entry.status]}</Badge>
          {entry.attemptCount > 1 && (
            <span
              title={`retry ×${entry.attemptCount}`}
              className="rounded bg-[var(--err)]/15 px-1 text-xs font-bold text-[var(--err-text)]"
            >
              ×{entry.attemptCount}
            </span>
          )}
          {artifacts?.degraded && (
            <Badge tone="warn" data-testid="degraded-chip">degraded</Badge>
          )}
          {cb && <Badge tone="neutral" title={`iterations ${cb.total_iterations} · cost $${cb.total_cost.toFixed(2)}`}>{cb.state ?? '?'}</Badge>}
        </div>

        <section>
          <SectionTitle className="mb-1">Inputs / Outputs</SectionTitle>
          {shownOutput === null ? (
            <p className="text-sm text-[var(--text-dim)]">No data recorded</p>
          ) : (
            <div>
              <pre className="max-h-64 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-elev)] p-2 font-mono text-xs leading-5 text-[var(--text-dim)]">
                {shownOutput}
              </pre>
              {rawOutput !== null && rawOutput.length > PAYLOAD_TRUNC && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-xs text-[var(--accent)] hover:underline"
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <SectionTitle className="mb-1">Tokens / Context</SectionTitle>
          {nodeTokens.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No token data</p>
          ) : (
            <ul className="space-y-0.5 font-mono text-xs leading-5 text-[var(--text-dim)]">
              {nodeTokens.map((t) => (
                <li key={t.node + (t.model ?? '')}>
                  {t.model ?? 'n/a'} · in {t.prompt_tokens} / out {t.completion_tokens} · ${t.cost_usd.toFixed(4)}
                  {t.estimated ? ' (est.)' : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle className="mb-1">Step logs</SectionTitle>
          {nodeLogs.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No logs for this node</p>
          ) : (
            <ul className="space-y-0.5 font-mono text-xs leading-5">
              {nodeLogs.map((e) => (
                <li key={e.id} className={e.level === 'error' ? 'text-[var(--err-text)]' : e.level === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--text-dim)]'}>
                  [{e.node}] [{e.level.toUpperCase()}] {e.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {node === 'parallel_audit' && (
          <section>
            <SectionTitle className="mb-1">Parallel Audit</SectionTitle>
            <details className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" open>
              <summary className="cursor-pointer text-sm font-medium">AppSec</summary>
              {secReview && secReview.vulnerabilities_found && secReview.vulnerabilities_found.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {secReview.vulnerabilities_found.map((v, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Badge tone={SEVERITY_TONE[v.severity ?? 'low'] ?? 'neutral'}>{v.severity ?? 'n/a'}</Badge>
                      <span className="text-[var(--text-dim)]">
                        {v.type ?? '?'} — {v.description ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-dim)]">No vulnerabilities found</p>
              )}
            </details>
            <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" open>
              <summary className="cursor-pointer text-sm font-medium">DevOps</summary>
              {devopsManifest ? (
                <div className="mt-1 space-y-0.5 text-xs text-[var(--text-dim)]">
                  <p>Deployability score: <span className="font-mono">{devopsManifest.deployability_score ?? 'n/a'}</span></p>
                  <p>Status: <span className="font-mono">{devopsManifest.status ?? 'n/a'}</span></p>
                  <p>Dockerfile: {devopsManifest.dockerfile_created ? 'yes' : 'no'} · CI workflow: {devopsManifest.ci_workflow_created ? 'yes' : 'no'}</p>
                  {devopsManifest.recommendations && devopsManifest.recommendations.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">
                      {devopsManifest.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-dim)]">No DevOps report</p>
              )}
            </details>
          </section>
        )}
      </div>
    </Drawer>
  )
}
