import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export interface DrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

// Drawer não-modal (UX8): overlay translúcido clicável para fechar,
// painel lateral direito fixo e fechamento com Esc.
export function Drawer({ open, title, onClose, children }: DrawerProps) {
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
    <div className="fixed inset-0 z-50" role="presentation">
      {/* overlay translúcido — clique fora fecha */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="absolute right-0 top-0 flex h-full w-[380px] flex-col border-l border-[var(--border)] bg-[var(--bg-elev)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
