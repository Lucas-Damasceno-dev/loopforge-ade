import { Modal } from './Modal'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// Confirmação destrutiva (01b §3.13): compartilha a base do modal §3.6,
// mas é SEMPRE danger — nunca dispara sem ação explícita do usuário.
// Distinta do modal de configuração (budget) e do modal de enforcement.
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} maxWidth={400}>
      <div className="p-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
