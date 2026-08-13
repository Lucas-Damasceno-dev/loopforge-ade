import type { ButtonHTMLAttributes } from 'react'

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange?: (checked: boolean) => void
  label: string
}

// Toggle (01b §3.12): trilho 28×16 radius-full, thumb 12 branco, hit area
// 24×24 via padding (alvo tátil §6.4), role="switch" + aria-checked,
// foco ring-2 accent, disabled opacity-50.
export function Toggle({ checked, onChange, label, disabled = false, className = '', ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`inline-flex items-center rounded-full p-1 transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-4 w-7 items-center rounded-full px-0.5 transition-colors duration-[var(--dur-base)] ${
          checked ? 'justify-end bg-[var(--accent)]' : 'justify-start bg-[var(--bg-elev-2)]'
        }`}
      >
        <span className="h-3 w-3 rounded-full bg-white" />
      </span>
    </button>
  )
}
