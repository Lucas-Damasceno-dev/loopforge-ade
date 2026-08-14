import { useToastStore, type ToastItem } from '../../stores/toastStore'

function toneStyle(tone: ToastItem['tone']) {
  switch (tone) {
    case 'ok':
      return 'border-[var(--ok)]/40 bg-[var(--bg-elev-2)] text-[var(--ok-text)]'
    case 'err':
      return 'border-[var(--err)]/40 bg-[var(--bg-elev-2)] text-[var(--err-text)]'
    case 'warn':
      return 'border-[var(--warn)]/40 bg-[var(--bg-elev-2)] text-[var(--warn-text)]'
    default:
      return 'border-[var(--accent)]/40 bg-[var(--bg-elev-2)] text-[var(--accent-text)]'
  }
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start justify-between gap-2.5 rounded-[var(--radius-md)] border p-3 shadow-[var(--shadow-modal)] backdrop-blur-md transition-all ade-toast-in ${toneStyle(
            toast.tone,
          )}`}
        >
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-[var(--text)]">{toast.title}</h4>
            {toast.message && (
              <p className="mt-0.5 text-(--text-2xs) leading-relaxed text-[var(--text-dim)]">{toast.message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="shrink-0 select-none text-xs text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
