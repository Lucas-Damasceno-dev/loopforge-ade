import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DockerPanel } from '../DockerPanel'
import type { DockerConfigResponse } from '../../../shared/lib/types'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(runId = 'run-docker-1') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <DockerPanel open runId={runId} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const fixture: DockerConfigResponse = {
  run_id: 'run-docker-1',
  stack: 'python',
  base_image: 'python:3.12-slim',
  dockerfile: 'FROM python:3.12-slim\nWORKDIR /app\nCMD ["python", "main.py"]',
  docker_compose: 'version: "3.8"\nservices:\n  app:\n    build: .',
  devcontainer: '{\n  "name": "LoopForge Python"\n}',
  dockerignore: '.git\n.venv\n',
  suggested_ports: [8000],
  environment_vars: { PYTHONUNBUFFERED: '1' },
}

describe('DockerPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders base image, suggested ports, and switches tabs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(fixture))

    renderPanel('run-docker-1')

    await waitFor(() => {
      expect(screen.getByText('python:3.12-slim')).toBeInTheDocument()
      expect(screen.getByText(':8000')).toBeInTheDocument()
      expect(screen.getAllByText('Dockerfile').length).toBeGreaterThanOrEqual(1)
    })

    // Switch to compose tab
    fireEvent.click(screen.getByRole('button', { name: /docker-compose\.yml/i }))
    expect(screen.getByText(/version: "3\.8"/)).toBeInTheDocument()

    // Switch to devcontainer tab
    fireEvent.click(screen.getByRole('button', { name: /devcontainer\.json/i }))
    expect(screen.getByText(/LoopForge Python/)).toBeInTheDocument()
  })

  it('handles save to workspace action', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(fixture))
      .mockResolvedValueOnce(jsonResponse({ run_id: 'run-docker-1', success: true, saved_files: ['Dockerfile'], message: 'Saved successfully' }))

    renderPanel('run-docker-1')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save to workspace/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /save to workspace/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })
})
