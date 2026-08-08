import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createRun } from '../../shared/lib/api'
import { Button } from '../../shared/ui/Button'
import { Textarea } from '../../shared/ui/Textarea'
import type { Run } from '../../shared/lib/types'

export interface NewRunFormProps {
  onCreated: (run: Run) => void
}

// Stack canônico (resolve_tech_stack / registry.py): python, java, rust, go, js.
export const STACK_OPTIONS = ['python', 'java', 'rust', 'go', 'js'] as const

// RoutingMode do backend (schemas.py): full, fast, patch, review-only, explore.
export const ROUTING_OPTIONS = ['full', 'fast', 'patch', 'review-only', 'explore'] as const

// Select estilizado conforme o Input (01b §3.12) — mesmo padrão do ConsolePanel.
const selectCls =
  'h-8 rounded-sm border border-[var(--border)] bg-[var(--bg-elev)] px-2 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'

// Form de nova run (B2/M-20): idea + stack + routing_mode (POST /api/v1/runs).
// mock_llm/interactive ficam nos defaults do client (false). TanStack Query
// useMutation — loading desabilita o botão; erro inline (alert).
export function NewRunForm({ onCreated }: NewRunFormProps) {
  const [idea, setIdea] = useState('')
  const [stack, setStack] = useState<string>(STACK_OPTIONS[0])
  const [routingMode, setRoutingMode] = useState<string>(ROUTING_OPTIONS[0])
  const mutation = useMutation({
    mutationFn: createRun,
    onSuccess: (run) => {
      setIdea('')
      onCreated(run)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = idea.trim()
    if (!text || mutation.isPending) return
    mutation.mutate({ idea: text, stack, routing_mode: routingMode })
  }

  return (
    <form onSubmit={submit} className="flex flex-1 items-center gap-2">
      <select aria-label="Stack" value={stack} onChange={(e) => setStack(e.target.value)} className={selectCls}>
        {STACK_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <select aria-label="Routing mode" value={routingMode} onChange={(e) => setRoutingMode(e.target.value)} className={selectCls}>
        {ROUTING_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <Textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Idea for the pipeline…"
        aria-label="Idea"
        rows={1}
        className="flex-1 resize-none py-1"
      />
      <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending || !idea.trim()}>
        {mutation.isPending ? 'Running…' : 'Run'}
      </Button>
      {mutation.isError ? (
        <p role="alert" className="text-xs text-[var(--err-text)]">Failed to start run</p>
      ) : null}
    </form>
  )
}
