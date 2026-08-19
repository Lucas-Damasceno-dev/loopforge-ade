import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from '../../shared/ui/Drawer'
import { Badge } from '../../shared/ui/Badge'
import { Input } from '../../shared/ui/Input'
import { EmptyState } from '../../shared/ui/EmptyState'
import { getRunAst } from '../../shared/lib/api'
import type { AstAnalysisResponse, AstSymbolInfo } from '../../shared/lib/types'

export interface AstPanelProps {
  open: boolean
  onClose: () => void
  runId: string | null
}

function getSymbolBadge(kind: string) {
  switch (kind) {
    case 'class':
    case 'struct':
      return <span className="rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-text)]">class</span>
    case 'async_function':
      return <span className="rounded bg-[var(--info)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--info-text)]">async fn</span>
    case 'interface':
    case 'trait':
      return <span className="rounded bg-[var(--ok)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ok-text)]">interface</span>
    default:
      return <span className="rounded bg-[var(--warn)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warn-text)]">fn</span>
  }
}

function getLangIcon(lang: string) {
  switch (lang) {
    case 'python': return 'P'
    case 'typescript': return 'T'
    case 'javascript': return 'J'
    case 'java': return 'J'
    case 'rust': return 'R'
    case 'go': return 'G'
    default: return '?'
  }
}

export function AstPanel({ open, onClose, runId }: AstPanelProps) {
  const [search, setSearch] = useState('')
  const [selectedModulePath, setSelectedModulePath] = useState<string | null>(null)

  const astQuery = useQuery<AstAnalysisResponse>({
    queryKey: ['run-ast', runId],
    queryFn: () => getRunAst(runId as string),
    enabled: open && !!runId,
  })

  const data = astQuery.data

  const filteredModules = useMemo(() => {
    if (!data?.modules) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.modules
    return data.modules.filter((m) => {
      if (m.file_path.toLowerCase().includes(q)) return true
      if (m.symbols.some((s) => s.name.toLowerCase().includes(q))) return true
      if (m.imports.some((i) => i.toLowerCase().includes(q))) return true
      return false
    })
  }, [data?.modules, search])

  const selectedModule = useMemo(() => {
    if (!filteredModules.length) return null
    if (selectedModulePath) {
      const found = filteredModules.find((m) => m.file_path === selectedModulePath)
      if (found) return found
    }
    return filteredModules[0]
  }, [filteredModules, selectedModulePath])

  return (
    <Drawer open={open} title="AST & Module Dependencies" onClose={onClose} width="wide">
      <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
        {/* Header Summary & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-dim)]">Modules:</span>
              <Badge tone="neutral">{data?.modules.length ?? 0}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-dim)]">Packages:</span>
              <Badge tone="neutral">{data?.external_packages.length ?? 0}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-dim)]">Graph Links:</span>
              <Badge tone="neutral">{data?.dependency_graph.length ?? 0}</Badge>
            </div>
          </div>
          <div className="w-64">
            <Input
              type="search"
              placeholder="Search symbols or files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        {/* Content Layout: 2 Columns */}
        {astQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-dim)]">
            Analyzing source code AST and dependencies…
          </div>
        ) : !data || data.modules.length === 0 ? (
          <EmptyState
            title="No AST data available"
            description="Run an agent pipeline to generate code modules and dependency maps."
          />
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
            {/* Left Sidebar: Modules & External Packages */}
            <div className="flex flex-col gap-3 overflow-hidden lg:col-span-4">
              {/* External Packages Card */}
              {data.external_packages.length > 0 && (
                <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2">
                    External Packages
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {data.external_packages.map((pkg) => (
                      <span
                        key={pkg}
                        className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--text)]"
                      >
                        <span aria-hidden="true" className="mr-1 font-bold text-[var(--accent)]">P</span>
                        {pkg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Module List */}
              <div className="flex flex-1 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)]">
                <div className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
                  Code Modules
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {filteredModules.map((mod) => {
                    const isSelected = selectedModule?.file_path === mod.file_path
                    return (
                      <button
                        key={mod.file_path}
                        type="button"
                        onClick={() => setSelectedModulePath(mod.file_path)}
                        className={[
                          'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors',
                          isSelected
                            ? 'bg-[var(--accent)] text-white font-medium shadow-sm'
                            : 'text-[var(--text)] hover:bg-[var(--bg-hover)]',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-1.5 truncate font-mono">
                          <span aria-hidden="true" className="select-none font-bold">{getLangIcon(mod.language)}</span>
                          <span className="truncate">{mod.file_path}</span>
                        </span>
                        <span
                          className={[
                            'ml-2 shrink-0 font-mono text-[10px]',
                            isSelected ? 'text-white/80' : 'text-[var(--text-dim)]',
                          ].join(' ')}
                        >
                          {mod.symbols.length} symbols
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right Panel: Module Details (Symbols & Imports) */}
            <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-4 lg:col-span-8">
              {selectedModule ? (
                <div className="flex flex-col gap-4 overflow-y-auto h-full">
                  {/* Module Header */}
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <div>
                      <h3 className="font-mono text-sm font-bold text-[var(--text)]">
                        {selectedModule.file_path}
                      </h3>
                      <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
                        Language: <span className="font-semibold uppercase">{selectedModule.language}</span> • {selectedModule.total_lines} lines
                      </p>
                    </div>
                  </div>

                  {/* Imports Section */}
                  {selectedModule.imports.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                        Imports & Dependencies ({selectedModule.imports.length})
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedModule.imports.map((imp, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent-text)]"
                          >
                            import {imp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Symbols Section */}
                  <div className="space-y-2 flex-1">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                      Declared Symbols & AST Nodes ({selectedModule.symbols.length})
                    </h4>
                    {selectedModule.symbols.length === 0 ? (
                      <p className="text-xs text-[var(--text-dim)] italic">No top-level classes or functions declared in this file.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedModule.symbols.map((sym: AstSymbolInfo, idx: number) => (
                          <div
                            key={idx}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-2.5 transition-colors hover:border-[var(--border-hover)]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {getSymbolBadge(sym.kind)}
                                <span className="font-mono text-xs font-bold text-[var(--text)]">
                                  {sym.name}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-[var(--text-dim)]">
                                Line {sym.line_number}
                              </span>
                            </div>
                            {sym.docstring && (
                              <p className="mt-1 text-[11px] text-[var(--text-dim)] italic bg-[var(--bg-elev-2)] p-1.5 rounded">
                                {sym.docstring}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[var(--text-dim)]">
                  Select a module from the list to inspect its AST structure.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
