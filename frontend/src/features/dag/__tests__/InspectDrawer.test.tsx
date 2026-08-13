import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InspectDrawer } from '../InspectDrawer'
import { getRunArtifacts } from '../../../shared/lib/api'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useRunsStore } from '../../../stores/runsStore'
import type { ArtifactsResponse } from '../../../shared/lib/types'

vi.mock('../../../shared/lib/api', () => ({ getRunArtifacts: vi.fn() }))

const queryClient = new QueryClient()

const ARTIFACTS: ArtifactsResponse = {
  run_id: 'r1',
  node_artifacts: {
    developer: { output: { code: 'def main():\n    pass\n' } },
    parallel_audit: {
      output: {
        security_review: {
          vulnerabilities_found: [{ severity: 'high', type: 'SQLi', description: 'query raw' }],
        },
        devops_manifest: {
          deployability_score: 90,
          status: 'ok',
          dockerfile_created: true,
          ci_workflow_created: true,
          recommendations: ['add healthcheck'],
        },
      },
    },
  },
  tokens: [{ node: 'developer', model: 'oc/test', prompt_tokens: 100, completion_tokens: 50, cost_usd: 0.01, estimated: false }],
  degraded: true,
  degraded_reason: 'mock fallback',
  circuit_breaker: { state: 'closed', consecutive_failures: 1, total_iterations: 3, total_cost: 0.5 },
  lessons: [],
}

function renderDrawer(node: string) {
  useRunsStore.setState({ runs: [], activeRunId: 'r1', queue: [], past: [], future: [] })
  useCanvasStore.setState({ selectedNodeId: node, nodeStatus: { [node]: { status: 'approved', attemptCount: 1 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <InspectDrawer />
    </QueryClientProvider>,
  )
}

describe('InspectDrawer (real artifacts)', () => {
  beforeEach(() => {
    vi.mocked(getRunArtifacts).mockReset()
    vi.mocked(getRunArtifacts).mockResolvedValue(ARTIFACTS)
    queryClient.clear()
  })

  it('mostra output do nó em JSON (developer → code)', async () => {
    renderDrawer('developer')
    expect(await screen.findByText(/def main/)).toBeInTheDocument()
  })

  it('mostra tokens do nó', async () => {
    renderDrawer('developer')
    expect(await screen.findByText(/in 100 \/ out 50/)).toBeInTheDocument()
  })

  it('sem artifacts mostra "No data recorded" (não o placeholder V1)', async () => {
    vi.mocked(getRunArtifacts).mockResolvedValue({ run_id: 'r1', node_artifacts: {}, tokens: [], degraded: false, lessons: [] })
    renderDrawer('pm')
    expect(await screen.findByText(/no data recorded/i)).toBeInTheDocument()
  })

  it('parallel_audit lista vulnerabilidades + devops score', async () => {
    renderDrawer('parallel_audit')
    // SQLi/90 aparecem no JSON bruto (pre) E nas seções estruturadas — aceita
    // qualquer ocorrência, o que importa é que os dados reais chegaram ao drawer.
    const sqli = await screen.findAllByText(/SQLi/)
    expect(sqli.length).toBeGreaterThan(0)
    const score = await screen.findAllByText(/90/)
    expect(score.length).toBeGreaterThan(0)
  })

  it('mostra chip degraded quando a run degradou', async () => {
    renderDrawer('developer')
    expect(await screen.findByText(/degraded/i)).toBeInTheDocument()
  })
})
