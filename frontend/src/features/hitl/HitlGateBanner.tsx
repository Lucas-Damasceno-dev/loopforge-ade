import { useHitlGateStore } from '../../stores/hitlGateStore'
import { CloseIcon } from '../../shared/ui/icons'

// Banner informativo de gate HITL (C3/M-12): renderiza o gate mais recente
// NÃO descartado, tom --warn, não-bloqueante (flui no layout, logo abaixo da
// topbar — não é fixo como o Banner do design system, p/ não colidir com o
// banner de "Decision expired" do HitlDrawer). Descartável (×): descartar o
// topo revela o gate anterior, se houver.
export function HitlGateBanner() {
  const gates = useHitlGateStore((s) => s.gates)
  const dismiss = useHitlGateStore((s) => s.dismiss)
  const gate = gates[0] ?? null
  if (!gate) return null

  const timeout = gate.timeoutSeconds !== undefined ? `${gate.timeoutSeconds}s` : null
  const suffix =
    timeout && gate.onTimeout ? ` (${gate.onTimeout})` : gate.onTimeout ? ` (${gate.onTimeout})` : ''

  return (
    <div
      role="status"
      data-testid="hitl-gate-banner"
      className="ade-banner-in flex items-center gap-3 border-b border-[var(--warn)]/30 bg-[var(--warn)]/15 px-4 py-1.5 text-sm text-[var(--warn-text)]"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warn)]" />
      <span className="min-w-0 flex-1 truncate">
        Gate HITL: <span className="font-medium">{gate.gateNode}</span>
        {timeout ? (
          <span className="opacity-90"> — timeout {timeout}{suffix}</span>
        ) : gate.onTimeout ? (
          <span className="opacity-90"> — {gate.onTimeout}</span>
        ) : null}
      </span>
      <button
        type="button"
        aria-label="Dismiss HITL gate banner"
        onClick={() => dismiss(gate.id)}
        className="shrink-0 rounded p-1 text-[var(--warn)] transition-colors duration-(--dur-fast) hover:bg-[var(--warn)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warn)]"
      >
        <CloseIcon />
      </button>
    </div>
  )
}
