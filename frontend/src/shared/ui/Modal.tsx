import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  title: string
  onClose?: () => void
  children: ReactNode
  maxWidth?: number
}

// Modal bloqueante (01b §3.6/§3.13): overlay --overlay-strong, card central
// radius-lg + shadow-modal, z-[70], focus trap, Esc fecha (quando onClose
// existe — o modal de enforcement de budget NÃO fecha por Esc). stopPropagation
// no Esc impede o drawer por trás de responder junto. onClose é OBRIGATÓRIO
// para o focus trap voltar o foco ao elemento anterior.
export function Modal({ open, title, onClose, children, maxWidth = 480 }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    cardRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Para o evento — o Drawer não-modal escuta em window e fecharia junto.
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="ade-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-[var(--overlay-strong)] p-4" role="presentation">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="ade-modal-card-in w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] shadow-[var(--shadow-modal)] outline-none"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
