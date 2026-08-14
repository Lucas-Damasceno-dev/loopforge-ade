import type { IconName } from '../ui/icons'

// ─── Views do shell (T2) ──────────────────────────────────────────────────
// Fonte única das views: ViewKey + VIEWS_META (rótulo/ícone) + WORKSPACE_GROUPS
// (agrupamento do rail). Nunca duplicar rótulos/ícones fora daqui — o rail e a
// sub-sidebar (T3) derivam deste módulo. Grupo "Pipeline" (runs/prompt/agents/
// pipelines) é novo; os demais herdam o agrupamento legado da topbar.

export type ViewKey =
  | 'runs'
  | 'prompt'
  | 'agents'
  | 'pipelines'
  | 'artifacts'
  | 'terminal'
  | 'ast'
  | 'coverage'
  | 'docker'
  | 'trajectories'
  | 'mcp'
  | 'memory'
  | 'evals'
  | 'git'
  | 'health'
  | 'prompts'
  | 'settings'

export interface ViewMeta {
  label: string
  icon: IconName
}

export const VIEWS_META: Record<ViewKey, ViewMeta> = {
  runs: { label: 'Runs', icon: 'runs' },
  prompt: { label: 'Prompt', icon: 'prompt' },
  agents: { label: 'Agents', icon: 'agents' },
  pipelines: { label: 'Pipelines', icon: 'pipelines' },
  artifacts: { label: 'Artifacts', icon: 'artifacts' },
  terminal: { label: 'Terminal', icon: 'terminal' },
  ast: { label: 'AST & Deps', icon: 'ast' },
  coverage: { label: 'Coverage', icon: 'coverage' },
  docker: { label: 'Docker', icon: 'docker' },
  trajectories: { label: 'Trajectories', icon: 'trajectories' },
  mcp: { label: 'MCP playground', icon: 'mcp' },
  memory: { label: 'Memory', icon: 'memory' },
  evals: { label: 'Evals', icon: 'evals' },
  git: { label: 'Git', icon: 'git' },
  health: { label: 'Health', icon: 'health' },
  prompts: { label: 'Prompts', icon: 'prompts' },
  settings: { label: 'Settings', icon: 'settings' },
}

export interface ViewGroup {
  group: string
  views: ViewKey[]
}

export const WORKSPACE_GROUPS: ViewGroup[] = [
  { group: 'Pipeline', views: ['runs', 'prompt', 'agents', 'pipelines'] },
  { group: 'Workspace & Code', views: ['artifacts', 'terminal', 'ast', 'coverage', 'docker'] },
  { group: 'Engine & Memory', views: ['trajectories', 'mcp', 'memory', 'evals'] },
  { group: 'System & Settings', views: ['git', 'health', 'prompts', 'settings'] },
]

/** Views com painel próprio (drawer/sidebar) — usadas pelo App p/ derivar
 *  `open` dos painéis a partir do activeView. */
export const PANEL_VIEWS: ViewKey[] = [
  'artifacts',
  'terminal',
  'ast',
  'coverage',
  'docker',
  'trajectories',
  'mcp',
  'memory',
  'evals',
  'git',
  'health',
  'prompts',
  'settings',
]

/** Views LEVES (T3): conteúdo direto na sub-sidebar (sem drawer). */
export const INLINE_VIEWS: ViewKey[] = ['prompt', 'agents', 'pipelines', 'memory', 'health', 'prompts', 'settings', 'git']

/** Views PESADAS (T3): resumo na sub-sidebar + "Open panel" → drawer. */
export const SUMMARY_VIEWS: ViewKey[] = [
  'runs',
  'artifacts',
  'terminal',
  'ast',
  'coverage',
  'docker',
  'mcp',
  'evals',
  'trajectories',
]
