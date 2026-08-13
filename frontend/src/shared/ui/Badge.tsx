import type { HTMLAttributes, ReactNode } from 'react'

// Tons do Badge (01b §2.1 Receita): tint /15 + border /30; TEXTO pela
// variante -text em ok/err/accent (o token base sobre o próprio tint falha
// AA em 12px: ok 5.2:1, err 3.8:1, accent 2.9:1). warn/neutral usam a base.
const tones = {
  neutral: 'bg-[var(--bg-elev)] text-[var(--text-dim)] border border-[var(--border)]',
  info: 'bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/30',
  ok: 'bg-[var(--ok)]/15 text-[var(--ok-text)] border border-[var(--ok)]/30',
  warn: 'bg-[var(--warn)]/15 text-[var(--warn)] border border-[var(--warn)]/30',
  err: 'bg-[var(--err)]/15 text-[var(--err-text)] border border-[var(--err)]/30',
  accent: 'bg-[var(--accent)]/15 text-[var(--accent-text)] border border-[var(--accent)]/30',
} as const

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof tones
  children: ReactNode
}

export function Badge({ tone = 'neutral', children, ...rest }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`} {...rest}>
      {children}
    </span>
  )
}
