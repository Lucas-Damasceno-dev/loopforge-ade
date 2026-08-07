import type { ReactNode } from 'react'

// Tons do Badge: neutral (padrão), ok/warn/err (semântico), accent (destaque).
const tones = {
  neutral: 'bg-[var(--bg-elev)] text-[var(--text-dim)] border border-[var(--border)]',
  ok: 'bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/30',
  warn: 'bg-[var(--warn)]/15 text-[var(--warn)] border border-[var(--warn)]/30',
  err: 'bg-[var(--err)]/15 text-[var(--err)] border border-[var(--err)]/30',
  accent: 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30',
} as const

export interface BadgeProps {
  tone?: keyof typeof tones
  children: ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
