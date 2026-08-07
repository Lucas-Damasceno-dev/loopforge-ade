import type { ReactNode } from 'react'

// Placeholder de botão compartilhado — expandido em tasks futuras.
export function Button({ children }: { children: ReactNode }) {
  return <button type="button">{children}</button>
}
