import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../App'
import { useViewStore } from '../../stores/viewStore'
import { useAuthStore } from '../../stores/authStore'
import { useRunsStore } from '../../stores/runsStore'
import { useEditorStore } from '../../features/pipelines/editorStore'
import { useBudgetOverrideStore } from '../../features/costs/budgetOverrideStore'

// ─── Mocks (mesmo esqueleto do App.test.tsx) ───────────────────────────────
// Diferença: BudgetPill vira stub clicável que expõe onOverride (App passa
// o guard `if (canAdmin && activeRunId)` — o teste verifica o efeito no
// budgetOverrideStore, dono do modal).

const wsStoreMock = { connect: vi.fn(), connectionStatus: 'open' }

vi.mock('../../stores/wsStore', () => ({
  useWsStore: Object.assign(vi.fn(() => wsStoreMock), { getState: () => wsStoreMock }),
}))

vi.mock('../../features/runs/RunsWorkspace', () => ({ RunsWorkspace: () => <div data-testid="workspace" /> }))
vi.mock('../../features/console/ConsolePanel', () => ({ ConsolePanel: () => null }))
vi.mock('../../features/dag/InspectDrawer', () => ({ InspectDrawer: () => null }))
vi.mock('../../features/hitl/HitlDrawer', () => ({ HitlDrawer: () => null }))
vi.mock('../../features/hitl/HitlGateBanner', () => ({ HitlGateBanner: () => null }))
vi.mock('../../features/timeline/TimelineBar', () => ({ TimelineBar: () => null }))
vi.mock('../../features/costs/BudgetPill', () => ({
  BudgetPill: ({ onOverride }: { onOverride?: () => void }) => (
    <button type="button" onClick={onOverride}>
      budget pill
    </button>
  ),
}))
vi.mock('../../features/mcp/McpPlayground', () => ({ McpPlayground: () => null }))
vi.mock('../../features/auth/ApiKeyGate', () => ({ ApiKeyGate: () => null }))
vi.mock('../../shared/ui/ToastContainer', () => ({ ToastContainer: () => null }))
vi.mock('../../shared/ui/Topbar', () => ({ Topbar: () => <header data-testid="topbar" /> }))
vi.mock('../../shared/ui/CommandPalette', () => ({ CommandPalette: () => <div data-testid="command-palette" /> }))
vi.mock('../../shared/ui/ActivityRail', () => ({ ActivityRail: () => <nav data-testid="rail" /> }))
vi.mock('../../shared/ui/SplitPane', () => ({
  SplitPane: ({ children }: { children?: import('react').ReactNode }) => <div data-testid="splitpane">{children}</div>,
}))

function panelStub(testid: string) {
  return (p: { open?: boolean; onClose?: () => void }) =>
    p.open ? (
      <div data-testid={testid}>
        <button type="button" onClick={p.onClose}>
          close drawer
        </button>
      </div>
    ) : null
}

vi.mock('../../features/trajectories/TrajectoriesPanel', () => ({ TrajectoriesPanel: panelStub('drawer-trajectories') }))
vi.mock('../../features/artifacts/ArtifactsPanel', () => ({ ArtifactsPanel: panelStub('drawer-artifacts') }))
vi.mock('../../features/terminal/TerminalPanel', () => ({ TerminalPanel: panelStub('drawer-terminal') }))
vi.mock('../../features/ast/AstPanel', () => ({ AstPanel: panelStub('drawer-ast') }))
vi.mock('../../features/coverage/CoveragePanel', () => ({ CoveragePanel: panelStub('drawer-coverage') }))
vi.mock('../../features/docker/DockerPanel', () => ({ DockerPanel: panelStub('drawer-docker') }))
vi.mock('../../features/evals/EvalsPanel', () => ({ EvalsPanel: panelStub('drawer-evals') }))
vi.mock('../../features/memory/MemoryPanel', () => ({ MemoryPanel: panelStub('drawer-memory') }))
vi.mock('../../features/git/GitPanel', () => ({ GitPanel: panelStub('drawer-git') }))
vi.mock('../../features/health/HealthPanel', () => ({ HealthPanel: panelStub('drawer-health') }))
vi.mock('../../features/prompts/PromptPanel', () => ({ PromptPanel: panelStub('drawer-prompts') }))
vi.mock('../../features/settings/SettingsPanel', () => ({ SettingsPanel: panelStub('drawer-settings') }))

beforeEach(() => {
  useViewStore.setState({ activeView: null })
  useAuthStore.setState({ principal: null })
  useRunsStore.setState({ runs: [], activeRunId: null })
  useEditorStore.setState({ open: false, live: true, draft: null, editingId: null, selectedEdgeId: null, positions: {} })
  useBudgetOverrideStore.setState({ open: false, runId: null })
})

// Cobertura dos gates de role do App (T6, fix round 1): barra do editor de
// pipelines só com can('admin'); onOverride do BudgetPill com guard canAdmin.
// Padrão: store real + useAuthStore.setState({principal}).
describe('App — gates de role (RBAC)', () => {
  it('viewer: barra do editor NÃO renderiza mesmo com editor aberto', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    act(() => {
      useEditorStore.setState({ open: true })
    })
    render(<App />)
    expect(screen.queryByRole('group', { name: 'Editor mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })

  it('admin: barra do editor renderiza com editor aberto (Edit/Live/Save)', () => {
    useAuthStore.setState({ principal: { name: 'admin', roles: ['admin'] } })
    act(() => {
      useEditorStore.setState({ open: true })
    })
    render(<App />)
    expect(screen.getByRole('group', { name: 'Editor mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('viewer: onOverride do BudgetPill NÃO abre o modal (guard canAdmin)', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    useRunsStore.setState({ activeRunId: 'r1' })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'budget pill' }))
    expect(useBudgetOverrideStore.getState().open).toBe(false)
    expect(useBudgetOverrideStore.getState().runId).toBeNull()
  })

  it('admin: onOverride do BudgetPill abre o modal com o runId ativo', () => {
    useAuthStore.setState({ principal: { name: 'admin', roles: ['admin'] } })
    useRunsStore.setState({ activeRunId: 'r1' })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'budget pill' }))
    expect(useBudgetOverrideStore.getState()).toMatchObject({ open: true, runId: 'r1' })
  })
})
