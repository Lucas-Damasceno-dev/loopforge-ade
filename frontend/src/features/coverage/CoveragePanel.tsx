import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from '../../shared/ui/Drawer'
import { Badge } from '../../shared/ui/Badge'
import { Input } from '../../shared/ui/Input'
import { EmptyState } from '../../shared/ui/EmptyState'
import { getRunCoverage } from '../../shared/lib/api'
import type { CoverageReportResponse, FileCoverageItem } from '../../shared/lib/types'

export interface CoveragePanelProps {
  open: boolean
  onClose: () => void
  runId: string | null
}

function getCoverageTone(pct: number): 'ok' | 'warn' | 'err' {
  if (pct >= 80) return 'ok'
  if (pct >= 50) return 'warn'
  return 'err'
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'bg-gradient-to-r from-emerald-500 to-teal-400'
  if (pct >= 50) return 'bg-gradient-to-r from-amber-500 to-yellow-400'
  return 'bg-gradient-to-r from-red-600 to-rose-400'
}

export function CoveragePanel({ open, onClose, runId }: CoveragePanelProps) {
  const [search, setSearch] = useState('')

  const covQuery = useQuery<CoverageReportResponse>({
    queryKey: ['run-coverage', runId],
    queryFn: () => getRunCoverage(runId as string),
    enabled: open && !!runId,
  })

  const data = covQuery.data

  const filteredFiles = useMemo(() => {
    if (!data?.files) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.files
    return data.files.filter((f) => f.file_path.toLowerCase().includes(q))
  }, [data?.files, search])

  const overallTone = data ? getCoverageTone(data.coverage_percentage) : 'neutral'

  return (
    <Drawer open={open} title="Test Code Coverage" onClose={onClose} width="wide">
      <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
        {/* Metric Cards Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Overall Coverage
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-extrabold text-[var(--text)]">
                {data ? `${data.coverage_percentage}%` : '—'}
              </span>
              {data && <Badge tone={overallTone}>{data.source === 'report' ? 'Report' : 'Heuristic'}</Badge>}
            </div>
          </div>

          <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Total Lines
            </span>
            <span className="mt-1 font-mono text-2xl font-extrabold text-[var(--text)]">
              {data ? data.total_lines.toLocaleString() : '—'}
            </span>
          </div>

          <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ok-text)]">
              Covered Lines
            </span>
            <span className="mt-1 font-mono text-2xl font-extrabold text-[var(--ok-text)]">
              {data ? data.covered_lines.toLocaleString() : '—'}
            </span>
          </div>

          <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--err-text)]">
              Missed Lines
            </span>
            <span className="mt-1 font-mono text-2xl font-extrabold text-[var(--err-text)]">
              {data ? (data.total_lines - data.covered_lines).toLocaleString() : '—'}
            </span>
          </div>
        </div>

        {/* Global Progress Bar */}
        {data && (
          <div className="flex flex-col gap-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elev-2)]">
              <div
                className={`h-full transition-all duration-500 ${getProgressColor(data.coverage_percentage)}`}
                style={{ width: `${Math.min(100, Math.max(0, data.coverage_percentage))}%` }}
              />
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">
            Files Breakdown ({filteredFiles.length})
          </h3>
          <div className="w-64">
            <Input
              type="search"
              placeholder="Filter files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        {/* File Table Breakdown */}
        {covQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-dim)]">
            Loading coverage metrics…
          </div>
        ) : !runId ? (
          <EmptyState
            title="Select a run first"
            description="Pick a run from the Runs list to view its test coverage report."
          />
        ) : !data || data.files.length === 0 ? (
          <EmptyState
            title="No coverage data available"
            description="Run the QA node in your pipeline to calculate test coverage."
          />
        ) : (
          <div className="flex-1 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)] font-semibold text-[var(--text-dim)]">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 w-48">Coverage</th>
                  <th className="px-3 py-2 text-right">Covered</th>
                  <th className="px-3 py-2 text-right">Missed</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono text-xs">
                {filteredFiles.map((file: FileCoverageItem) => {
                  const tone = getCoverageTone(file.percentage)
                  return (
                    <tr key={file.file_path} className="hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="px-3 py-2 font-medium text-[var(--text)]">
                        {file.file_path}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-elev-2)]">
                            <div
                              className={`h-full ${getProgressColor(file.percentage)}`}
                              style={{ width: `${file.percentage}%` }}
                            />
                          </div>
                          <Badge tone={tone}>
                            {file.percentage}%
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--ok-text)]">
                        {file.covered_lines}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--err-text)]">
                        {file.missed_lines}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">
                        {file.total_lines}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  )
}
