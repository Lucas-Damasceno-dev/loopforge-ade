import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { CloseIcon } from './icons'

export interface DrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Cor do título no header (ex.: variante -text do acento do nó, §3.2). */
  titleStyle?: CSSProperties
}

// Drawer não-modal (01b §3.2/§3.8): 380px à direita (full-width <sm),
// overlay --overlay clicável, Esc fecha, aria-modal="false" (o canvas
// continua visível), shadow-drawer, entrada com slide 200ms. z-[50] (escala
// §2.7).
export function Drawer({ open, title, onClose, children, titleStyle }: DrawerProps) {
  // Listener global de Esc — limpo ao desmontar.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[50]" role="presentation">
      {/* overlay translúcido — clique fora fecha */}
      <div className="ade-fade-in absolute inset-0 bg-[var(--overlay)]" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="ade-drawer-in absolute right-0 top-0 flex h-full w-full max-w-[380px] flex-col border-l border-[var(--border)] bg-[var(--bg-elev)] shadow-[var(--shadow-drawer)] sm:w-[380px]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text)]" style={titleStyle}>{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-dim)] transition-colors duration-100 hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
