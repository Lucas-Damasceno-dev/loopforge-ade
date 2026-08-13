import type { TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Marca o campo com borda/ring de erro (mensagem externa com role="alert"). */
  invalid?: boolean
}

// Form control (01b §3.12): base do Input, radius-md (6px), padding 8px,
// resize vertical, altura mínima por uso (ex.: h-28 no Adjust State).
export function Textarea({ invalid = false, className = '', ...rest }: TextareaProps) {
  return (
    <textarea
      className={[
        'w-full resize-y rounded-md border bg-[var(--bg-elev)] p-2 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)]',
        'transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid
          ? 'border-[var(--err)] ring-2 ring-[var(--err)]/40'
          : 'border-[var(--border)] hover:border-[var(--border-hover)]',
        className,
      ].join(' ')}
      {...rest}
    />
  )
}
