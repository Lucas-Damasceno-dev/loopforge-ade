// ─── Ícones do shell (T2) ─────────────────────────────────────────────────
// SVGs inline stroke currentColor (lucide-style, viewBox 24), fonte única
// p/ Topbar e ActivityRail. Nenhuma lib nova — regra do projeto. O 13 ícones
// legados vieram de Topbar.tsx; runs/prompt/agents/pipelines são novos (grupo
// Pipeline do rail).

const ICONS = {
  // Console do panel bottom (T6): chevron simples (não VS Code).
  console: <polyline points="9 18 15 12 9 6" />,
  // Pipeline (T2): views novas do rail de atividade.
  runs: (
    <>
      <circle cx="5" cy="12" r="3" />
      <circle cx="19" cy="12" r="3" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </>
  ),
  prompt: (
    <>
      <polyline points="4 6 9 11 4 16" />
      <line x1="13" x2="20" y1="11" y2="11" />
    </>
  ),
  agents: (
    <>
      <rect x="6" y="9" width="12" height="10" rx="2" />
      <line x1="9" x2="9" y1="9" y2="6" />
      <line x1="15" x2="15" y1="9" y2="6" />
      <circle cx="10" cy="13" r="1" />
      <circle cx="14" cy="13" r="1" />
    </>
  ),
  pipelines: (
    <>
      <rect x="7" y="3" width="10" height="4" rx="1" />
      <rect x="7" y="10" width="10" height="4" rx="1" />
      <rect x="7" y="17" width="10" height="4" rx="1" />
      <line x1="12" x2="12" y1="7" y2="10" />
      <line x1="12" x2="12" y1="14" y2="17" />
    </>
  ),
  // Legados (movidos de Topbar.tsx).
  trajectories: (
    <>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  mcp: (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </>
  ),
  memory: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </>
  ),
  evals: (
    <>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </>
  ),
  git: (
    <>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" x2="9" y1="12" y2="12" />
      <line x1="15" x2="21" y1="12" y2="12" />
    </>
  ),
  health: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  prompts: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  artifacts: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </>
  ),
  settings: (
    <>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </>
  ),
  terminal: (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>
  ),
  ast: (
    <>
      <circle cx="12" cy="5" r="3" />
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="12" y1="8" x2="6" y2="16" />
      <line x1="12" y1="8" x2="18" y2="16" />
    </>
  ),
  coverage: (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  docker: (
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M8 19h8" />
      <path d="M12 15v6" />
    </>
  ),
} as const

export type IconName = keyof typeof ICONS

// Glifo de close (legado, era o único ícone deste arquivo): substitui ✕/×
// inconsistentes entre Drawer, RunTabs e HitlGateBanner.
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

export function Icon({ name, className = 'h-3.5 w-3.5 shrink-0' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[name]}
    </svg>
  )
}
