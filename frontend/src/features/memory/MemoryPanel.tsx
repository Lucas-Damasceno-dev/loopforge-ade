import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createLesson, deleteLesson, listLessons } from '../../shared/lib/api'
import type { Lesson } from '../../shared/lib/types'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'

// Memory (MemoryPanel): CRUD de lições aprendidas do LoopForge (lê a tabela
// `lessons` do telemetry.sqlite via /api/v1/memory/lessons). Lista com badge de
// stack, ideia, texto truncado e data; busca por query + filtro de stack;
// formulário de criação e botão de exclusão por lição.

// Lições vêm do SQLite com created_at em epoch SECONDS (REAL).
function formatCreatedAt(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return ''
  return new Date(epochSeconds * 1000).toLocaleString()
}

// Trunca o texto da lição para a listagem (140 chars) mantendo o texto íntegro
// no atributo de dados/aria — exibição apenas.
function truncate(text: string, max = 140): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

interface ApiLikeError {
  status: number
  detail: unknown
}
function isApiError(e: unknown): e is ApiLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    'detail' in e
  )
}
// Detail do backend exibido como veio (PT); 422 pydantic é array de erros.
function memoryErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    const detail = e.detail
    if (Array.isArray(detail)) return 'Invalid lesson data (422)'
    if (typeof detail === 'string' && detail.trim().length > 0) return detail
    return `API error ${e.status}`
  }
  return e instanceof Error && e.message ? e.message : 'Failed to load lessons'
}

export function MemoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()

  // Filtros aplicados (disparados no Search/Reset — não a cada tecla).
  const [filters, setFilters] = useState<{ stack?: string; query?: string }>({})
  const [stackInput, setStackInput] = useState('')
  const [queryInput, setQueryInput] = useState('')

  // Formulário de criação.
  const [runId, setRunId] = useState('')
  const [stack, setStack] = useState('')
  const [idea, setIdea] = useState('')
  const [lessonText, setLessonText] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['memory-lessons'] })

  const { data: lessons, isLoading, error } = useQuery({
    queryKey: ['memory-lessons', filters],
    queryFn: () => listLessons({ stack: filters.stack || undefined, query: filters.query || undefined }),
  })

  const applyFilters = () => {
    setFilters({
      stack: stackInput.trim() || undefined,
      query: queryInput.trim() || undefined,
    })
  }

  const resetFilters = () => {
    setStackInput('')
    setQueryInput('')
    setFilters({})
  }

  const submitCreate = async () => {
    if (!lessonText.trim()) return
    setCreating(true)
    setCreateError(null)
    setCreated(false)
    try {
      // Lições manuais (ADE) não têm run origin: fallback 'manual'.
      await createLesson({
        run_id: runId.trim() || 'manual',
        stack: stack.trim(),
        idea: idea.trim(),
        lesson_text: lessonText.trim(),
      })
      setCreated(true)
      setRunId('')
      setStack('')
      setIdea('')
      setLessonText('')
      invalidate()
    } catch (e) {
      setCreateError(memoryErrorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  const removeLesson = async (lesson: Lesson) => {
    try {
      await deleteLesson(lesson.id)
      invalidate()
    } catch (e) {
      setCreateError(memoryErrorMessage(e))
    }
  }

  return (
    <Drawer open={open} title="Memory" onClose={onClose}>
      <div className="space-y-5">
        {createError && (
          <Alert tone="err">{createError}</Alert>
        )}
        {created && (
          <Alert tone="ok">Lesson saved</Alert>
        )}

        {/* Busca: query + filtro de stack */}
        <section>
          <SectionTitle className="mb-1">Search lessons</SectionTitle>
          <div className="space-y-2">
            <label htmlFor="memory-search" className="mb-0.5 block text-xs text-[var(--text-dim)]">Keyword</label>
            <Input
              id="memory-search"
              aria-label="Search lessons"
              placeholder="Keyword (idea or lesson text)"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters()
              }}
            />
            <label htmlFor="memory-stack" className="mb-0.5 block text-xs text-[var(--text-dim)]">Stack filter</label>
            <Input
              id="memory-stack"
              aria-label="Search stack"
              placeholder="Stack filter (ex.: python)"
              value={stackInput}
              onChange={(e) => setStackInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters()
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={applyFilters}>
                Search
              </Button>
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </section>

        {/* Nova lição */}
        <section>
          <SectionTitle className="mb-1">New lesson</SectionTitle>
          <div className="space-y-2">
            <label htmlFor="memory-run-id" className="mb-0.5 block text-xs text-[var(--text-dim)]">Run ID</label>
            <Input
              id="memory-run-id"
              aria-label="Run ID"
              placeholder="Run ID (default: manual)"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
            />
            <label htmlFor="memory-stack-new" className="mb-0.5 block text-xs text-[var(--text-dim)]">Stack</label>
            <Input
              id="memory-stack-new"
              aria-label="Stack"
              placeholder="Stack (ex.: python)"
              value={stack}
              onChange={(e) => setStack(e.target.value)}
            />
            <label htmlFor="memory-idea" className="mb-0.5 block text-xs text-[var(--text-dim)]">Idea</label>
            <Input
              id="memory-idea"
              aria-label="Idea"
              placeholder="Idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
            <label htmlFor="memory-lesson-text" className="mb-0.5 block text-xs text-[var(--text-dim)]">Lesson text</label>
            <Textarea
              id="memory-lesson-text"
              aria-label="Lesson text"
              placeholder="Lesson learned"
              className="h-24"
              value={lessonText}
              onChange={(e) => setLessonText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" disabled={creating || !lessonText.trim()} onClick={submitCreate}>
                {creating ? 'Adding…' : 'Add lesson'}
              </Button>
            </div>
          </div>
        </section>

        {/* Lista de lições */}
        <section>
          <SectionTitle className="mb-1">Lessons</SectionTitle>
          {isLoading ? (
            <p className="text-sm text-[var(--text-dim)]">Loading lessons…</p>
          ) : error ? (
            <Alert tone="err">{memoryErrorMessage(error)}</Alert>
          ) : lessons && lessons.length > 0 ? (
            <ul className="space-y-1.5">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone="accent">{lesson.stack}</Badge>
                        <span className="truncate text-xs font-semibold text-[var(--text)]">{lesson.idea}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-dim)]" title={lesson.lesson_text}>
                        {truncate(lesson.lesson_text)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-dim)]">{formatCreatedAt(lesson.created_at)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`Delete lesson ${lesson.id}`}
                      onClick={() => removeLesson(lesson)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-dim)]">No lessons yet</p>
          )}
        </section>
      </div>
    </Drawer>
  )
}
