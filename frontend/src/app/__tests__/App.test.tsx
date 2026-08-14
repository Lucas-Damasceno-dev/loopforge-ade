import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../App'
import { useViewStore } from '../../stores/viewStore'

// ─── Mocks (fix round 1, F3) ──────────────────────────────────────────────
// Teste de integração do shell: SidebarHost REAL + painéis stub. O objetivo é
// provar que fechar o drawer expandido (handleDrawerClose) NÃO derruba a
// sub-sidebar (activeView permanece). Painéis leves/pesados viram stubs com
// onClose acionável.

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
vi.mock('../../features/costs/CostBar', () => ({ CostBar: () => null }))
vi.mock('../../features/mcp/McpPlayground', () => ({ McpPlayground: () => null }))
vi.mock('../../features/auth/ApiKeyGate', () => ({ ApiKeyGate: () => null }))
vi.mock('../../shared/ui/ToastContainer', () => ({ ToastContainer: () => null }))
vi.mock('../../shared/ui/Topbar', () => ({ Topbar: () => <header data-testid="topbar" /> }))
vi.mock('../../shared/ui/ActivityRail', () => ({ ActivityRail: () => <nav data-testid="rail" /> }))
vi.mock('../../shared/ui/SplitPane', () => ({
  SplitPane: ({ children }: { children?: import('react').ReactNode }) => <div data-testid="splitpane">{children}</div>,
}))

// Stub genérico de painel: renderiza o "drawer" só quando open; o botão
// interno aciona onClose (equivalente ao X do Drawer real).
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

describe('App shell — fix round 1 (F3)', () => {
  beforeEach(() => {
    useViewStore.setState({ activeView: null })
  })

  it('fechar drawer expandido mantém a sub-sidebar aberta (não mata a view)', () => {
    // Abre a view artifacts na sidebar (como o usuário faria no rail).
    act(() => {
      useViewStore.getState().openView('artifacts')
    })
    render(<App />)

    // Sidebar real com resumo + "Open panel".
    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Artifacts panel' }))
    // Drawer expandido abre (painel stub renderiza).
    expect(screen.getByTestId('drawer-artifacts')).toBeInTheDocument()

    // Fecha o drawer (X do painel → handleDrawerClose).
    fireEvent.click(screen.getByRole('button', { name: 'close drawer' }))
    expect(screen.queryByTestId('drawer-artifacts')).not.toBeInTheDocument()
    // F3: a sidebar PERMANECE aberta com o resumo — closeView não é chamado.
    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
  })
})
