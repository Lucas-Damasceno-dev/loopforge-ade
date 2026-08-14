import { useEffect } from 'react'
import { useEditorStore } from './editorStore'
import { useAgentsStore } from '../../stores/agentsStore'
import type { PipelineNodeType } from '../../shared/lib/types'

// Paleta do editor (S3): coluna à esquerda do canvas em modo edição. Agentes
// da biblioteca (agentsStore) + tipos estruturais (split/merge/gate/input/
// output). Clique adiciona ao draft (addNode) — escolha por simplicidade de
// teste; drag via dataTransfer ficaria acoplado ao React Flow.
const STRUCTURAL_TYPES: Array<{ type: PipelineNodeType; hint: string }> = [
  { type: 'split', hint: 'Parallel fan-out' },
  { type: 'merge', hint: 'Parallel fan-in' },
  { type: 'gate', hint: 'Conditional gate' },
  { type: 'input', hint: 'Entry point' },
  { type: 'output', hint: 'Exit point' },
]

export function NodePalette() {
  const addNode = useEditorStore((s) => s.addNode)
  const agents = useAgentsStore((s) => s.agents)

  useEffect(() => {
    void useAgentsStore.getState().fetchAgents()
  }, [])

  return (
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-44 flex-col gap-1.5 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elev)]/95 p-2 shadow-[var(--shadow-md)] backdrop-blur-sm">
      <span className="text-(--text-2xs) font-semibold uppercase tracking-wide text-[var(--text-dim)]">Nodes</span>
      {STRUCTURAL_TYPES.map((t) => (
        <button
          key={t.type}
          type="button"
          title={t.hint}
          onClick={() => addNode(t.type)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-left text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {t.type === 'split' ? 'Split' : t.type === 'merge' ? 'Merge' : t.type === 'gate' ? 'Gate' : t.type === 'input' ? 'Input' : 'Output'}
        </button>
      ))}
      <span className="mt-1 border-t border-[var(--border)] pt-1.5 text-(--text-2xs) font-semibold uppercase tracking-wide text-[var(--text-dim)]">
        Agents
      </span>
      {agents.length === 0 ? (
        <span className="text-xs text-[var(--text-dim)]">No agents — create one in the Agents panel.</span>
      ) : (
        agents.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.description || a.name}
            onClick={() => addNode('agent', a.id)}
            className="truncate rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-left text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {a.name}
          </button>
        ))
      )}
    </div>
  )
}
