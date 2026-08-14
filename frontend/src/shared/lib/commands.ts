import type { ViewKey } from './views'

// ─── Command palette (T7, MVP) ─────────────────────────────────────────────
// Registro PURo de comandos (sem imports de stores): o App injeta as ações
// via PaletteCtx (callbacks). A UI (CommandPalette) filtra + executa.

export interface PaletteCtx {
  openView: (v: ViewKey) => void
  closeView: () => void
  openBudgetOverride: () => void
  toggleInspector: () => void
  toggleFocus: () => void
  toggleConsole: () => void
  focusNewRunIdea: () => void
}

export interface Command {
  id: string
  title: string
  /** Atalho exibido à direita (registro global só do ⌘K no MVP). */
  kbd?: string
  keywords: string[]
  run: (ctx: PaletteCtx) => void
}

export const COMMANDS: Command[] = [
  { id: 'new-run', title: 'New run', kbd: '⌘⏎', keywords: ['run', 'new', 'create', 'start', 'pipeline'], run: (ctx) => ctx.focusNewRunIdea() },
  { id: 'view-runs', title: 'Runs', keywords: ['runs', 'queue', 'history', 'open'], run: (ctx) => ctx.openView('runs') },
  { id: 'view-prompt', title: 'Prompt', keywords: ['prompt', 'idea', 'prompting', 'open'], run: (ctx) => ctx.openView('prompt') },
  { id: 'view-memory', title: 'Memory', keywords: ['memory', 'lessons', 'open'], run: (ctx) => ctx.openView('memory') },
  { id: 'view-health', title: 'Health', keywords: ['health', 'status', 'telemetry', 'open'], run: (ctx) => ctx.openView('health') },
  { id: 'view-settings', title: 'Settings', keywords: ['settings', 'config', 'budget', 'open'], run: (ctx) => ctx.openView('settings') },
  { id: 'toggle-console', title: 'Toggle console', kbd: '⌘J', keywords: ['console', 'logs', 'panel', 'output', 'toggle'], run: (ctx) => ctx.toggleConsole() },
  { id: 'toggle-inspector', title: 'Toggle inspector', kbd: '⌘I', keywords: ['inspector', 'details', 'cost', 'toggle'], run: (ctx) => ctx.toggleInspector() },
  { id: 'focus-mode', title: 'Focus mode', kbd: '⌘⇧F', keywords: ['focus', 'fullscreen', 'canvas', 'zen'], run: (ctx) => ctx.toggleFocus() },
  { id: 'budget-override', title: 'Budget override', kbd: '⌘⇧B', keywords: ['budget', 'override', 'cost', 'limit', 'spend'], run: (ctx) => ctx.openBudgetOverride() },
  // Fechar é manipulado pela UI (Esc/overlay); o comando existe p/ busca.
  { id: 'palette-close', title: 'Close palette', keywords: ['close', 'dismiss', 'escape', 'cancel'], run: () => {} },
]

/** Filtro case-insensitive por title + keywords (query vazia → tudo). */
export function filterCommands(query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return COMMANDS
  return COMMANDS.filter((c) => c.title.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q)))
}
