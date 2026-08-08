import type { ButtonHTMLAttributes } from 'react'

const variants = {
  primary: 'bg-[var(--accent)] text-white hover:opacity-90',
  ghost: 'bg-transparent text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-elev)]',
  danger: 'bg-[var(--err)] text-white hover:opacity-90',
  subtle: 'bg-[var(--bg-elev)] text-[var(--text-dim)] hover:text-[var(--text)]',
} as const

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function Button({ variant = 'ghost', size = 'md', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-md font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
