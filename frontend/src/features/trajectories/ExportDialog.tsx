import { useState } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Button } from '../../shared/ui/Button'
import { exportTrajectory } from '../../shared/lib/api'
import { downloadJson } from '../../shared/lib/download'
import type { Run, TrajectoryExport } from '../../shared/lib/types'
import { trajectoryErrorMessage } from './errorMsg'
import { shortId } from './shortId'

// Export enriquecido (M-14): POST /trajectories/export/{run_id} devolve o
// JSON schema 1.1 (checkpoints + steps + events + costs). Modal com botão de
// download (blob) + prévia colapsável do JSON. Loading no fetch, erro inline.
export function ExportDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TrajectoryExport | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await exportTrajectory(run.id)
      setData(res)
    } catch (e) {
      setError(trajectoryErrorMessage(e, 'Falha ao exportar a trajetória'))
    } finally {
      setLoading(false)
    }
  }

  const checkpointCount = Array.isArray(data?.checkpoints) ? data.checkpoints.length : 0

  return (
    <Modal open title="Exportar trajetória" onClose={onClose} maxWidth={560}>
      <div className="p-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Exportar trajetória</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          Run <span className="font-mono text-[var(--text)]">{shortId(run.id)}</span> — JSON enriquecido (schema
          1.1) com checkpoints, steps por nó, eventos do journal e custos.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-[var(--err)]/30 bg-[var(--err)]/15 px-3 py-2 text-sm text-[var(--err-text)]"
          >
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={loading} onClick={load}>
            {loading ? 'Exportando…' : data ? 'Atualizar' : 'Exportar'}
          </Button>
          {data && (
            <Button size="sm" variant="subtle" onClick={() => downloadJson(`trajectory-${run.id}.json`, data)}>
              Baixar JSON
            </Button>
          )}
        </div>

        {data && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--text-dim)] transition-colors duration-100 hover:text-[var(--text)]">
              Prévia do JSON ({checkpointCount} checkpoints)
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[11px] leading-5 text-[var(--text-dim)] [scrollbar-gutter:stable]">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        )}

        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
