import { useEditorStore } from './editorStore'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Button } from '../../shared/ui/Button'
import type { PipelineEdgeType } from '../../shared/lib/types'

// EdgeConfigDrawer (S3): configuração da edge selecionada no modo edição —
// type (sequential/parallel/conditional/retry), condition (se conditional) e
// max_retries (se retry). Fecha com a edge atual no draft (updateEdge).
export function EdgeConfigDrawer() {
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId)
  const draft = useEditorStore((s) => s.draft)
  const updateEdge = useEditorStore((s) => s.updateEdge)
  const removeEdge = useEditorStore((s) => s.removeEdge)
  const setSelectedEdgeId = useEditorStore((s) => s.setSelectedEdgeId)

  if (!selectedEdgeId || !draft) return null
  const edge = draft.edges.find((e) => `${e.source}->${e.target}` === selectedEdgeId)
  if (!edge) return null

  const set = (patch: Partial<{ type: PipelineEdgeType; condition: string | null; max_retries: number }>) =>
    updateEdge(selectedEdgeId, patch)

  return (
    <div className="absolute right-3 top-3 z-10 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)]/95 p-2.5 shadow-[var(--shadow-md)] backdrop-blur-sm">
      <SectionTitle>Edge config</SectionTitle>
      <label className="flex flex-col gap-0.5 text-(--text-2xs) font-medium uppercase tracking-wide text-[var(--text-dim)]">
        Type
        <select
          value={edge.type}
          aria-label="Type"
          onChange={(e) => set({ type: e.target.value as PipelineEdgeType })}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-1 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <option value="sequential">Sequential</option>
          <option value="parallel">Parallel</option>
          <option value="conditional">Conditional</option>
          <option value="retry">Retry</option>
        </select>
      </label>

      {edge.type === 'conditional' && (
        <label className="mt-2 flex flex-col gap-0.5 text-(--text-2xs) font-medium uppercase tracking-wide text-[var(--text-dim)]">
          Condition
          <input
            value={edge.condition ?? ''}
            aria-label="Condition"
            onChange={(e) => set({ condition: e.target.value || null })}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-1 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>
      )}

      {edge.type === 'retry' && (
        <label className="mt-2 flex flex-col gap-0.5 text-(--text-2xs) font-medium uppercase tracking-wide text-[var(--text-dim)]">
          Max retries
          <input
            type="number"
            // F5 (fix wave): validator exige max_retries >= 1 p/ retry — UI
            // não pode aceitar 0 (falharia só no save).
            min={1}
            value={edge.max_retries}
            aria-label="Max retries"
            onChange={(e) => set({ max_retries: Math.max(1, Number(e.target.value) || 1) })}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-1 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>
      )}

      <div className="mt-2 flex gap-1.5 border-t border-[var(--border)] pt-2">
        <Button size="sm" variant="danger" className="flex-1" onClick={() => removeEdge(selectedEdgeId)}>
          Delete edge
        </Button>
        <Button size="sm" variant="subtle" className="flex-1" onClick={() => setSelectedEdgeId(null)}>
          Done
        </Button>
      </div>
    </div>
  )
}
