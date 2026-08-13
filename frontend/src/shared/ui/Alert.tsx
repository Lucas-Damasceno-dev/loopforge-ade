import type { HTMLAttributes, ReactNode } from 'react'

// Tons do Alert (01b §2.1 Receita): tint /15 + border /30 + variante -text.
// err → role="alert"; ok/info → role="status". Substitui o bloco de feedback
// inline duplicado em ~7 painéis.
const tones = {
  err: { role: 'alert', cls: 'border-[var(--err)]/30 bg-[var(--err)]/15 text-[var(--err-text)]' },
  ok: { role: 'status', cls: 'border-[var(--ok)]/30 bg-[var(--ok)]/15 text-[var(--ok-text)]' },
  info: { role: 'status', cls: 'border-[var(--info)]/30 bg-[var(--info)]/15 text-[var(--info-text)]' },
  warn: { role: 'status', cls: 'border-[var(--warn)]/30 bg-[var(--warn)]/15 text-[var(--warn-text)]' },
} as const

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof tones
  children: ReactNode
}

export function Alert({ tone = 'err', children, className = '', ...rest }: AlertProps) {
  const { role, cls } = tones[tone]
  return (
    <div role={role} className={`rounded-md border px-3 py-2 text-sm ${cls} ${className}`} {...rest}>
      {children}
    </div>
  )
}
