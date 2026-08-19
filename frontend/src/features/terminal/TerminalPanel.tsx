import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { getTerminalInfo, execTerminalCommand } from '../../shared/lib/api'
import { showToast } from '../../stores/toastStore'
import type { ExecCommandResponse, TerminalInfoResponse } from '../../shared/lib/types'

export interface TerminalPanelProps {
  open: boolean
  onClose: () => void
  runId: string | null
}

interface CommandHistoryItem {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
  durationSeconds: number
  timestamp: number
}

const PRESET_COMMANDS = [
  'pytest -v',
  'git status --short',
  'ls -la',
  'cat PROJECT_SUMMARY.md',
  'cat lessons.md',
]

export function TerminalPanel({ open, onClose, runId }: TerminalPanelProps) {
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<CommandHistoryItem[]>([])
  const [historyIdx, setHistoryIdx] = useState<number>(-1)
  const [sentCommands, setSentCommands] = useState<string[]>([])
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const infoQuery = useQuery<TerminalInfoResponse>({
    queryKey: ['terminal-info', runId],
    queryFn: () => getTerminalInfo(runId as string),
    enabled: open && !!runId,
  })

  const execMutation = useMutation({
    mutationFn: (cmd: string) => execTerminalCommand(runId as string, cmd),
    onSuccess: (res: ExecCommandResponse) => {
      const item: CommandHistoryItem = {
        id: Math.random().toString(36).slice(2, 9),
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.exit_code,
        durationSeconds: res.duration_seconds,
        timestamp: Date.now(),
      }
      setHistory((prev) => [...prev, item])
      setSentCommands((prev) => [res.command, ...prev.filter((c) => c !== res.command)])
      setHistoryIdx(-1)
      setCommand('')
    },
    onError: (err) => {
      showToast('Command Failed', String(err), 'err')
    },
  })

  // Auto-scroll output ao fundo
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [history, execMutation.isPending])

  // Foco no input ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = command.trim()
    if (!trimmed || !runId || execMutation.isPending) return
    execMutation.mutate(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (sentCommands.length > 0) {
        const nextIdx = Math.min(historyIdx + 1, sentCommands.length - 1)
        setHistoryIdx(nextIdx)
        setCommand(sentCommands[nextIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1
        setHistoryIdx(nextIdx)
        setCommand(sentCommands[nextIdx])
      } else if (historyIdx === 0) {
        setHistoryIdx(-1)
        setCommand('')
      }
    }
  }

  const handleClear = () => {
    setHistory([])
    showToast('Terminal Cleared', 'Command history cleared', 'info')
  }

  const handleCopyLogs = () => {
    const text = history
      .map((h) => `$ ${h.command}\n${h.stdout}${h.stderr ? `\n[STDERR]\n${h.stderr}` : ''}\n(exit: ${h.exitCode})`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    showToast('Copied', 'Terminal session copied to clipboard', 'ok')
  }

  return (
    <Drawer open={open} title="Interactive Web Terminal" onClose={onClose} width="wide">
      <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-semibold text-[var(--text)]">Workspace:</span>
            <span className="truncate font-mono text-[11px] text-[var(--text-dim)]">
              {infoQuery.data?.workspace_path ?? (runId ? `/tmp/loopforge/run_${runId}` : 'No active run')}
            </span>
            {infoQuery.data?.exists ? (
              <Badge tone="ok">Ready</Badge>
            ) : (
              <Badge tone="warn">Workspace Empty</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="subtle" onClick={handleCopyLogs} disabled={history.length === 0}>
              Copy Session
            </Button>
            <Button size="sm" variant="subtle" onClick={handleClear} disabled={history.length === 0}>
              Clear
            </Button>
          </div>
        </div>

        {/* Quick Command Chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-semibold text-[var(--text-dim)] mr-1">Quick:</span>
          {PRESET_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => {
                setCommand(cmd)
                execMutation.mutate(cmd)
              }}
              disabled={execMutation.isPending || !runId}
              className="rounded border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5 font-mono text-[11px] text-[var(--text)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)]"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Terminal Output Area */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-relaxed text-[var(--text)] shadow-inner"
        >
          {history.length === 0 && !execMutation.isPending ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-dim)]">
              <span aria-hidden="true" className="text-2xl mb-1 font-bold text-[var(--accent)]">T</span>
              <p className="font-semibold text-sm text-[var(--text)]">Terminal Ready</p>
              <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
                Type any command below or click a quick command preset to execute in the workspace.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[var(--text-dim)] border-b border-white/5 pb-1">
                    <span className="flex items-center gap-1.5 font-semibold text-[var(--ok-text)]">
                      <span className="text-[var(--ok)] select-none">❯</span>
                      <span className="text-[var(--text)]">{item.command}</span>
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-[var(--text-dim)]">{item.durationSeconds}s</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-bold ${
                          item.exitCode === 0 ? 'bg-[var(--ok)]/20 text-[var(--ok-text)]' : 'bg-[var(--err)]/20 text-[var(--err-text)]'
                        }`}
                      >
                        exit: {item.exitCode}
                      </span>
                    </div>
                  </div>
                  {item.stdout && (
                    <pre className="whitespace-pre-wrap break-all text-[var(--text)] font-mono text-xs">
                      {item.stdout}
                    </pre>
                  )}
                  {item.stderr && (
                    <pre className="whitespace-pre-wrap break-all text-[var(--err-text)] font-mono text-xs bg-[var(--err)]/15 p-1.5 rounded border border-[var(--err)]/30">
                      {item.stderr}
                    </pre>
                  )}
                </div>
              ))}

              {execMutation.isPending && (
                <div className="flex items-center gap-2 text-[var(--accent-text)]">
                  <span aria-hidden="true" className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Executing command: {command}…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Command Input Bar */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-[var(--accent)]">
              $
            </span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={runId ? 'Type a shell command (e.g. pytest, git status, ls -la)…' : 'Select a run first'}
              disabled={!runId || execMutation.isPending}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] py-2 pl-7 pr-3 font-mono text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={!runId || !command.trim() || execMutation.isPending}
          >
            {execMutation.isPending ? 'Running…' : 'Run'}
          </Button>
        </form>
      </div>
    </Drawer>
  )
}
