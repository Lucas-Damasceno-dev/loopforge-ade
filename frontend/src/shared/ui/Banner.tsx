import type { ReactNode } from 'react'

// Banner fixo no topo (full width) — 01b §3.8: z-[60] (acima do drawer 50,
// abaixo do modal 70), err → role="alert", warn/info → role="status".
// Ancorado em top-11 (44px): fica ABAIXO da topbar h-11 sem cobri-la.
// Entrada com slide de -100% (200ms) — ver §4 Motion.
const tones = {
  warn: { role: 'status', cls: 'bg-[var(--warn)]/15 text-[var(--warn-text)] border-b border-[var(--warn)]/30' },
  err: { role: 'alert', cls: 'bg-[var(--err)]/15 text-[var(--err-text)] border-b border-[var(--err)]/30' },
  info: { role: 'status', cls: 'bg-[var(--info)]/15 text-[var(--info)] border-b border-[var(--info)]/30' },
} as const

export interface BannerProps {
  tone: keyof typeof tones
  children: ReactNode
}

export function Banner({ tone, children }: BannerProps) {
  const { role, cls } = tones[tone]
  return (
    <div role={role} className={`ade-banner-in fixed inset-x-0 top-11 z-[60] px-4 py-2 text-sm ${cls}`}>
      {children}
    </div>
  )
}
