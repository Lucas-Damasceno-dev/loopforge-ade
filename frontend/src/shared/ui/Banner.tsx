import type { ReactNode } from 'react'

// Banner fixo no topo (full width) — usado p/ estado offline e avisos.
// err → role="alert"; warn/info → role="status".
const tones = {
  warn: { role: 'status', cls: 'bg-[var(--warn)]/15 text-[var(--warn)] border-b border-[var(--warn)]/30' },
  err: { role: 'alert', cls: 'bg-[var(--err)]/15 text-[var(--err)] border-b border-[var(--err)]/30' },
  info: { role: 'status', cls: 'bg-[var(--accent)]/15 text-[var(--accent)] border-b border-[var(--accent)]/30' },
} as const

export interface BannerProps {
  tone: keyof typeof tones
  children: ReactNode
}

export function Banner({ tone, children }: BannerProps) {
  const { role, cls } = tones[tone]
  return (
    <div role={role} className={`fixed inset-x-0 top-0 z-50 px-4 py-2 text-sm ${cls}`}>
      {children}
    </div>
  )
}
