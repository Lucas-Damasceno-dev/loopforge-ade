import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { getDockerConfig, saveDockerConfig } from '../../shared/lib/api'
import { showToast } from '../../stores/toastStore'
import type { DockerConfigResponse } from '../../shared/lib/types'

export interface DockerPanelProps {
  open: boolean
  onClose: () => void
  runId: string | null
}

type TabKey = 'dockerfile' | 'compose' | 'devcontainer' | 'dockerignore'

export function DockerPanel({ open, onClose, runId }: DockerPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dockerfile')

  const dockerQuery = useQuery<DockerConfigResponse>({
    queryKey: ['docker-config', runId],
    queryFn: () => getDockerConfig(runId as string),
    enabled: open && !!runId,
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const d = dockerQuery.data
      if (!d || !runId) throw new Error('No docker config data')
      return saveDockerConfig(runId, {
        dockerfile: d.dockerfile,
        docker_compose: d.docker_compose,
        devcontainer: d.devcontainer,
        dockerignore: d.dockerignore,
      })
    },
    onSuccess: (res) => {
      showToast('Docker Config Saved', res.message, 'ok')
    },
    onError: (err) => {
      showToast('Save Failed', String(err), 'err')
    },
  })

  const data = dockerQuery.data

  const getCurrentContent = (): string => {
    if (!data) return ''
    switch (activeTab) {
      case 'dockerfile': return data.dockerfile
      case 'compose': return data.docker_compose
      case 'devcontainer': return data.devcontainer
      case 'dockerignore': return data.dockerignore
    }
  }

  const getFilename = (): string => {
    switch (activeTab) {
      case 'dockerfile': return 'Dockerfile'
      case 'compose': return 'docker-compose.yml'
      case 'devcontainer': return '.devcontainer/devcontainer.json'
      case 'dockerignore': return '.dockerignore'
    }
  }

  const handleCopy = () => {
    const text = getCurrentContent()
    if (!text) return
    navigator.clipboard.writeText(text)
    showToast('Copied', `${getFilename()} copied to clipboard`, 'ok')
  }

  const handleDownload = () => {
    const text = getCurrentContent()
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = activeTab === 'devcontainer' ? 'devcontainer.json' : getFilename()
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showToast('Downloaded', `Downloaded ${getFilename()}`, 'ok')
  }

  return (
    <Drawer open={open} title="Docker & Devcontainer" onClose={onClose} width="wide">
      <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
        {/* Environment Status Card */}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elev)] p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--text)]">Base Image:</span>
              <Badge tone="accent">{data.base_image}</Badge>
              {data.suggested_ports.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-dim)]">Ports:</span>
                  {data.suggested_ports.map((p) => (
                    <span key={p} className="rounded bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)] border border-[var(--border)]">
                      :{p}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="subtle" onClick={handleCopy} disabled={!data}>
                Copy File
              </Button>
              <Button size="sm" variant="subtle" onClick={handleDownload} disabled={!data}>
                Download
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !data}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save to Workspace'}
              </Button>
            </div>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center gap-1 border-b border-[var(--border)] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('dockerfile')}
            className={[
              'rounded-md px-3 py-1.5 font-medium transition-colors',
              activeTab === 'dockerfile'
                ? 'bg-[var(--bg-elev-2)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
            ].join(' ')}
          >
            <span aria-hidden="true" className="mr-1.5 font-bold text-[var(--accent)]">D</span>
            <span>Dockerfile</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compose')}
            className={[
              'rounded-md px-3 py-1.5 font-medium transition-colors',
              activeTab === 'compose'
                ? 'bg-[var(--bg-elev-2)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
            ].join(' ')}
          >
            <span aria-hidden="true" className="mr-1.5 font-bold text-[var(--accent)]">C</span>
            <span>docker-compose.yml</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('devcontainer')}
            className={[
              'rounded-md px-3 py-1.5 font-medium transition-colors',
              activeTab === 'devcontainer'
                ? 'bg-[var(--bg-elev-2)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
            ].join(' ')}
          >
            <span aria-hidden="true" className="mr-1.5 font-bold text-[var(--accent)]">V</span>
            <span>devcontainer.json</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dockerignore')}
            className={[
              'rounded-md px-3 py-1.5 font-medium transition-colors',
              activeTab === 'dockerignore'
                ? 'bg-[var(--bg-elev-2)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
            ].join(' ')}
          >
            <span aria-hidden="true" className="mr-1.5 font-bold text-[var(--accent)]">I</span>
            <span>.dockerignore</span>
          </button>
        </div>

        {/* Code Content Area */}
        {dockerQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-dim)]">
            Generating optimized container configurations…
          </div>
        ) : !data ? (
          <EmptyState
            title="No Docker config available"
            description="Select a completed run or start a new pipeline to generate Docker & Devcontainer files."
          />
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-[11px] font-mono text-[var(--text-dim)]">
              <span>{getFilename()}</span>
              <span>{getCurrentContent().split('\n').length} lines</span>
            </div>
            <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-[var(--text)]">
              <pre className="whitespace-pre font-mono text-xs">
                {getCurrentContent()}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
