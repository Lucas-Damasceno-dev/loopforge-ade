import { useCallback, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

export interface SplitPaneProps {
  direction: 'horizontal' | 'vertical'
  initialSize: number
  minSize: number
  /** Teto do redimensionamento (default: sem teto — compat legado). */
  maxSize?: number
  /** Inverte a ordem visual: child A em baixo (vertical) / à direita (horizontal). */
  reversed?: boolean
  children: [ReactNode, ReactNode]
}

// Teto interno do redimensionamento (clamp minSize..maxSize).
const MAX_SIZE = 10000

// Painel dividido: child A com flexBasis = size, divider arrastável via
// pointer events (move/up escutados em window durante o arraste).
export function SplitPane({ direction, initialSize, minSize, maxSize = MAX_SIZE, reversed = false, children }: SplitPaneProps) {
  const [size, setSize] = useState(initialSize)
  const isHorizontal = direction === 'horizontal'

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const start = isHorizontal ? e.clientX : e.clientY
      const startSize = size
      const onMove = (ev: PointerEvent) => {
        const next = (isHorizontal ? ev.clientX : ev.clientY) - start + startSize
        setSize(Math.min(Math.max(next, minSize), maxSize))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [isHorizontal, size, minSize, maxSize],
  )

  const flexDir = isHorizontal
    ? reversed ? 'flex-row-reverse' : 'flex-row'
    : reversed ? 'flex-col-reverse' : 'flex-col'

  return (
    <div className={`flex h-full w-full ${flexDir}`}>
      <div style={{ flexBasis: size, flexGrow: 0, flexShrink: 0 }} className="min-h-0 min-w-0 overflow-hidden">
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        onPointerDown={onPointerDown}
        className={`shrink-0 bg-[var(--border)] hover:bg-[var(--accent)] ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}`}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children[1]}</div>
    </div>
  )
}
