import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { getRunFiles, downloadRunZip } from '../../shared/lib/api'
import { showToast } from '../../stores/toastStore'
import type { RunFileItem, RunFilesResponse } from '../../shared/lib/types'

export interface ArtifactsPanelProps {
  open: boolean
  onClose: () => void
  runId: string | null
}

function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'py': return 'P'
    case 'ts':
    case 'tsx': return 'T'
    case 'js':
    case 'jsx': return 'J'
    case 'java': return 'J'
    case 'rs': return 'R'
    case 'go': return 'G'
    case 'md': return 'M'
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml': return 'C'
    case 'html':
    case 'css': return 'W'
    case 'sql': return 'S'
    case 'sh': return 'S'
    default: return 'F'
  }
}

function getFileCategory(path: string): string {
  if (path.startsWith('tests/') || path.includes('_test.') || path.includes('.test.')) return 'Tests'
  if (path.endsWith('.md') || path.startsWith('docs/')) return 'Documentation'
  if (path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.toml') || path.endsWith('.ini')) return 'Configuration'
  return 'Source Code'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ArtifactsPanel({ open, onClose, runId }: ArtifactsPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data } = useQuery<RunFilesResponse>({
    queryKey: ['run-files', runId],
    queryFn: () => getRunFiles(runId as string),
    enabled: open && !!runId,
    staleTime: 4000,
    refetchInterval: 5000,
  })

  const files = data?.files ?? []

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files
    const query = search.toLowerCase().trim()
    return files.filter(
      (f) => f.path.toLowerCase().includes(query) || (f.content && f.content.toLowerCase().includes(query)),
    )
  }, [files, search])

  const selectedFile = useMemo(() => {
    if (selectedPath) {
      const found = files.find((f) => f.path === selectedPath)
      if (found) return found
    }
    return filteredFiles[0] ?? files[0] ?? null
  }, [files, selectedPath, filteredFiles])

  const handleDownload = async () => {
    if (!runId) return
    setDownloading(true)
    try {
      await downloadRunZip(runId)
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadSingleFile = () => {
    if (!selectedFile?.content) return
    const blob = new Blob([selectedFile.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fileName = selectedFile.path.split('/').pop() || 'file'
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    if (!selectedFile?.content) return
    try {
      await navigator.clipboard.writeText(selectedFile.content)
      setCopied(true)
      showToast('Copied to clipboard', `Copied ${selectedFile.path} content`, 'ok')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback simples
    }
  }

  const [viewMode, setViewMode] = useState<'code' | 'diff'>('code')

  const handleExportBriefing = () => {
    const summaryFile =
      files.find((f) => f.path.includes('PROJECT_SUMMARY') || f.path.includes('README') || f.path.includes('ARCHITECTURE')) ||
      files[0]
    if (!summaryFile?.content || !runId) return
    const blob = new Blob([summaryFile.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loopforge-briefing-${runId.slice(0, 8)}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Briefing exported', 'Downloaded executive markdown report', 'ok')
  }

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, RunFileItem[]>()
    for (const file of filteredFiles) {
      const cat = getFileCategory(file.path)
      const list = map.get(cat) ?? []
      list.push(file)
      map.set(cat, list)
    }
    return Array.from(map.entries())
  }, [filteredFiles])

  return (
    <Drawer
      open={open}
      title={runId ? `Generated Artifacts & Files (#${runId.slice(0, 8)})` : 'Generated Artifacts & Files'}
      onClose={onClose}
    >
      <div className="flex h-full flex-col gap-3">
        {/* Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search files or content…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="font-mono text-xs text-[var(--text-dim)]">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="subtle"
              onClick={handleExportBriefing}
              title="Export project executive briefing report"
            >
              Export Briefing
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleDownload}
              disabled={downloading || !runId}
              title="Download all generated files as a ZIP archive"
            >
              {downloading ? 'Preparing ZIP…' : 'Download ZIP'}
            </Button>
          </div>
        </div>

        {/* Content Layout: 2 Columns */}
        {files.length === 0 ? (
          <EmptyState
            title="No artifacts generated yet"
            description="Artifacts and files will appear here once the Developer node outputs code."
          />
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
            {/* File Tree / List */}
            <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] lg:col-span-4">
              <div className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
                Files
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-3">
                {groupedByCategory.map(([category, items]) => (
                  <div key={category} className="space-y-1">
                    <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[var(--text-dim)] uppercase">
                      {category}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((file) => {
                        const isSelected = selectedFile?.path === file.path
                        return (
                          <button
                            key={file.path}
                            type="button"
                            onClick={() => setSelectedPath(file.path)}
                            className={[
                              'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors',
                              isSelected
                                ? 'bg-[var(--accent)] text-white font-medium shadow-sm'
                                : 'text-[var(--text)] hover:bg-[var(--bg-hover)]',
                            ].join(' ')}
                          >
                            <span className="flex items-center gap-1.5 truncate font-mono">
                              <span aria-hidden="true" className="select-none text-xs font-bold">{getFileIcon(file.path)}</span>
                              <span className="truncate">{file.path}</span>
                            </span>
                            <span
                              className={[
                                'ml-2 shrink-0 font-mono text-[10px]',
                                isSelected ? 'text-white/80' : 'text-[var(--text-dim)]',
                              ].join(' ')}
                            >
                              {formatBytes(file.size)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Code / Content Viewer */}
            <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] lg:col-span-8">
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 bg-[var(--bg)]">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-mono text-xs font-semibold text-[var(--text)] truncate">
                        {selectedFile.path}
                      </span>
                      <Badge tone="neutral">{formatBytes(selectedFile.size)}</Badge>
                      {selectedFile.is_binary && <Badge tone="warn">Binary / Large</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center rounded border border-[var(--border)] bg-[var(--bg-elev)] p-0.5">
                        <button
                          type="button"
                          onClick={() => setViewMode('code')}
                          className={[
                            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                            viewMode === 'code' ? 'bg-[var(--bg-elev-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
                          ].join(' ')}
                        >
                          Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('diff')}
                          className={[
                            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                            viewMode === 'diff' ? 'bg-[var(--bg-elev-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
                          ].join(' ')}
                        >
                          Diff
                        </button>
                      </div>
                      {selectedFile.content && (
                        <>
                          <Button size="sm" variant="subtle" onClick={handleDownloadSingleFile} title="Download this single file">
                            Download
                          </Button>
                          <Button size="sm" variant="subtle" onClick={handleCopy}>
                            {copied ? 'Copied!' : 'Copy'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto bg-[var(--bg-elev-2)] p-2 font-mono text-xs leading-5">
                    {selectedFile.is_binary ? (
                      <div className="flex h-full items-center justify-center text-[var(--text-dim)]">
                        Binary or large file. Download ZIP to inspect locally.
                      </div>
                    ) : selectedFile.content ? (
                      <table className="w-full border-collapse font-mono text-xs">
                        <tbody>
                          {selectedFile.content.split('\n').map((line, idx) => {
                            const isAdded = viewMode === 'diff' && line.startsWith('+')
                            const isRemoved = viewMode === 'diff' && line.startsWith('-')
                            return (
                              <tr
                                key={idx}
                                className={[
                                  'hover:bg-[var(--bg-hover)] transition-colors',
                                  isAdded ? 'bg-[var(--ok)]/10 text-[var(--ok-text)]' : '',
                                  isRemoved ? 'bg-[var(--err)]/10 text-[var(--err-text)]' : '',
                                ].join(' ')}
                              >
                                <td className="w-10 select-none pr-3 text-right font-mono text-[10px] text-[var(--text-dim)] opacity-50 align-top">
                                  {idx + 1}
                                </td>
                                <td className="whitespace-pre break-all pl-2 font-mono align-top text-[var(--text)]">
                                  {isAdded ? (
                                    <span className="font-semibold text-[var(--ok-text)]">{line}</span>
                                  ) : isRemoved ? (
                                    <span className="font-semibold text-[var(--err-text)]">{line}</span>
                                  ) : line.trim().startsWith('#') || line.trim().startsWith('//') ? (
                                    <span className="text-[var(--text-dim)] italic">{line}</span>
                                  ) : line.startsWith('import ') || line.startsWith('from ') || line.startsWith('use ') ? (
                                    <span className="text-[var(--accent-text)]">{line}</span>
                                  ) : line.includes('def ') || line.includes('fn ') || line.includes('class ') || line.includes('export ') ? (
                                    <span className="font-semibold text-[var(--text)]">{line}</span>
                                  ) : (
                                    <span>{line}</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--text-dim)]">
                        File is empty
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[11px] font-mono text-[var(--text-dim)]">
                    <span className="truncate">{selectedFile.path}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span>{selectedFile.content ? `${selectedFile.content.split('\n').length} lines` : '0 lines'}</span>
                      <span>UTF-8</span>
                      <span>{formatBytes(selectedFile.size)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-dim)] text-xs">
                  Select a file from the list to preview its contents.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
