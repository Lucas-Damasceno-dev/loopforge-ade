import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createRun } from '../../shared/lib/api'
import { Button } from '../../shared/ui/Button'
import type { Run } from '../../shared/lib/types'

export interface NewRunFormProps {
  onCreated: (run: Run) => void
}

// Form de nova run: idea (POST /api/runs só aceita idea) + botão Run.
// TanStack Query useMutation — loading desabilita o botão; erro inline (alert).
export function NewRunForm({ onCreated }: NewRunFormProps) {
  const [idea, setIdea] = useState('')
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
    mutation.mutate(text)
  }

  return (
    <form onSubmit={submit} className="flex flex-1 items-center gap-2">
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Idea for the pipeline…"
        aria-label="Idea"
        rows={1}
        className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-2 focus:outline-[var(--accent)]"
      />
      <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending || !idea.trim()}>
        {mutation.isPending ? 'Running…' : 'Run'}
      </Button>
      {mutation.isError ? (
        <p role="alert" className="text-xs text-[var(--err)]">Failed to start run</p>
      ) : null}
    </form>
  )
}
