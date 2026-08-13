// Ícones inline do design system (auditoria P0): glifo único de close —
// substitui ✕/× inconsistentes entre Drawer, RunTabs e HitlGateBanner.
export interface IconProps {
  className?: string
}

export function CloseIcon({ className = '' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}
