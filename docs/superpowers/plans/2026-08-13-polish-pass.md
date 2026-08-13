# Polish Pass (P0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar camada de polish visual (P0) sobre o tema dark zinc+indigo da SPA LoopForge ADE.

**Architecture:** Refinamento de tokens CSS + classes de componentes existentes. Zero dependências novas, zero mudança de layout/estrutura, zero alteração de `data-testid`. Cada task toca um grupo de arquivos com ciclo próprio de teste.

**Tech Stack:** React 19, Tailwind 4, Vitest, TypeScript 5.7. Worktree de execução: web repo `.worktrees/polish-pass` (branch `feature/polish-pass`), criado na hora via using-git-worktrees.

## Global Constraints

- CSS-only: zero dependências novas; keyframes/transitions em `frontend/src/styles/tokens.css`.
- `prefers-reduced-motion` já zera animações (tokens.css:136-144) — motion novo usa essa infra automaticamente.
- UI strings em **inglês**; comentários de código em **português**.
- Nenhum `data-testid` alterado/removido. Contrato de props só ESTENDIDO (prop nova com default), nunca quebrado.
- Verificação por task: `npm test` (309+) + `npx tsc -b` verdes. Comandos rodam em `frontend/`.
- Paths relativos à raiz do web repo.

---

### Task 1: Fundação de tokens (tokens.css)

**Files:**
- Modify: `frontend/src/styles/tokens.css`

**Interfaces:**
- Produces (tokens consumidos nas Tasks 2, 3 e 5):
  - `--dur-fast: 100ms`, `--dur-base: 150ms`, `--dur-slow: 250ms`, `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
  - `--glow-accent: 0 0 0 1px var(--accent), 0 0 14px rgb(79 70 229 / 0.35)`
  - `--node-pm-text`, `--node-test-writer-text`, `--node-developer-text`, `--node-qa-text`, `--node-retry-text`, `--node-parallel-audit-text`

- [ ] **Step 1: Adicionar tokens de motion e glow**

Em `tokens.css`, logo após o bloco `--radius-*` (linha 74, antes do bloco de tipografia linha 76), inserir:

```css
  /* Motion (auditoria P0): durações + easing único — consumir via
   * duration-[var(--dur-*)]; nunca duration-* solto. */
  --dur-fast: 100ms;
  --dur-base: 150ms;
  --dur-slow: 250ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* Glow do nó running (auditoria P0): substitui rgb hardcoded no AgentNode. */
  --glow-accent: 0 0 0 1px var(--accent), 0 0 14px rgb(79 70 229 / 0.35);
```

- [ ] **Step 2: Adicionar variantes -text dos nós**

Em `tokens.css`, no bloco §2.2 (linhas 45-54), substituir as linhas dos nós sem variante por versões com `-text` (uma linha por par base/texto):

```css
  --node-entry: #64748b;  --node-entry-text: #94a3b8;       /* slate-500/400 */
  --node-cpo: #4f46e5;                                       /* = --accent; rótulo usa --accent-text */
  --node-pm: #0ea5e9;      --node-pm-text: #38bdf8;          /* sky-500/400 */
  --node-tech-lead: #8b5cf6; --node-tech-lead-text: #a78bfa; /* violet-500/400 */
  --node-test-writer: #ec4899; --node-test-writer-text: #f9a8d4; /* pink-500/300 */
  --node-developer: #10b981; --node-developer-text: #34d399; /* emerald-500/400 — id canônico (contrato 03 §7) */
  --node-dev: #10b981;                                       /* emerald-500 — alias legado (mantido p/ compat) */
  --node-qa: #f59e0b;      --node-qa-text: #fbbf24;          /* amber-500/400 */
  --node-retry: #f43f5e;   --node-retry-text: #fb7185;       /* rose-500/400 */
  --node-parallel-audit: #14b8a6; --node-parallel-audit-text: #2dd4bf; /* teal-500/400 */
```

- [ ] **Step 3: Scrollbar 8px + thumb visível + ::selection**

Em `tokens.css`, no bloco scrollbar (linhas 111-133), substituir inteiro por:

```css
/* ─── Scrollbar (01b §2.8) — console, drawers, abas, painéis ──────────── */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-hover) transparent;
}
*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background: var(--border-hover);
  border: 2px solid transparent;
  border-radius: var(--radius-full);
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(161, 161, 170, 0.6); /* --text-dim a 60% */
  border: 2px solid transparent;
  background-clip: padding-box;
}

::selection {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
}
```

- [ ] **Step 4: Unificar easing do modal**

Em `tokens.css`, substituir:

```css
.ade-modal-card-in {
  animation: ade-modal-in 200ms ease-out;
}
```

por:

```css
.ade-modal-card-in {
  animation: ade-modal-in 200ms var(--ease-out);
}
```

- [ ] **Step 5: Verificar**

Run (em `frontend/`): `npm test` → esperado 309+ passed; `npx tsc -b` → sem erros.
Nota: mudanças são só CSS tokens — nenhum teste unitário asserta valores de tokens; a suíte é o guard de não-regressão.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/tokens.css
git commit -m "style(tokens): durações/easing únicos, glow accent, -text p/ nós, scrollbar 8px, selection"
```

---

### Task 2: Contraste — warn-text + variantes -text de nós

**Files:**
- Modify: `frontend/src/shared/ui/Badge.tsx`
- Modify: `frontend/src/shared/ui/Banner.tsx`
- Modify: `frontend/src/features/console/ConsolePanel.tsx:21-25`
- Modify: `frontend/src/features/hitl/HitlGateBanner.tsx`
- Modify: `frontend/src/features/dag/nodeAccent.ts`
- Test: `frontend/src/features/dag/__tests__/nodeAccent.test.ts` (novo)

**Interfaces:**
- Consumes: tokens `--warn-text` (já existe, tokens.css:41) e variantes `-text` da Task 1.
- Produces: `nodeAccentTextVar` cobre todos os nós (sem fallback de base para pm/test_writer/developer/qa/retry/parallel_audit).

- [ ] **Step 1: Teste falhando para nodeAccentTextVar**

Criar `frontend/src/features/dag/__tests__/nodeAccent.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nodeAccentTextVar } from '../nodeAccent'

// Variantes -text (auditoria P0): rótulo do nó usa a variante clara quando a
// base fica <4.5:1 sobre --bg-elev — agora TODOS os nós têm variante própria.
describe('nodeAccentTextVar', () => {
  it('usa variante -text para todos os nós com contraste insuficiente', () => {
    expect(nodeAccentTextVar('pm')).toBe('var(--node-pm-text)')
    expect(nodeAccentTextVar('test_writer')).toBe('var(--node-test-writer-text)')
    expect(nodeAccentTextVar('developer')).toBe('var(--node-developer-text)')
    expect(nodeAccentTextVar('qa')).toBe('var(--node-qa-text)')
    expect(nodeAccentTextVar('retry')).toBe('var(--node-retry-text)')
    expect(nodeAccentTextVar('parallel_audit')).toBe('var(--node-parallel-audit-text)')
  })

  it('mantém as variantes existentes e o fallback de base', () => {
    expect(nodeAccentTextVar('entry')).toBe('var(--node-entry-text)')
    expect(nodeAccentTextVar('cpo')).toBe('var(--accent-text)')
    expect(nodeAccentTextVar('tech_lead')).toBe('var(--node-tech-lead-text)')
    expect(nodeAccentTextVar('terminal')).toBe('var(--node-terminal)')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/dag/__tests__/nodeAccent.test.ts`
Expected: FAIL — `pm`/`test_writer`/`developer`/`qa`/`retry`/`parallel_audit` retornam `var(--node-*)` base.

- [ ] **Step 3: Implementar**

Em `nodeAccent.ts`, substituir o bloco `TEXT_VARIANTS` (linhas 9-16) por:

```ts
// Variantes -text para o RÓTULO do nó (texto): quando a base fica <4.5:1
// sobre --bg-elev, o rótulo usa OBRIGATORIAMENTE a variante clara (auditoria
// P0: pm/test_writer/developer/qa/retry/parallel_audit também falhavam AA).
const TEXT_VARIANTS: Partial<Record<NodeType, string>> = {
  entry: 'var(--node-entry-text)',
  cpo: 'var(--accent-text)',
  pm: 'var(--node-pm-text)',
  tech_lead: 'var(--node-tech-lead-text)',
  test_writer: 'var(--node-test-writer-text)',
  developer: 'var(--node-developer-text)',
  qa: 'var(--node-qa-text)',
  retry: 'var(--node-retry-text)',
  parallel_audit: 'var(--node-parallel-audit-text)',
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/features/dag/__tests__/nodeAccent.test.ts`
Expected: PASS (7 asserts).

- [ ] **Step 5: warn-text nos tons warn**

Em `Badge.tsx:10`, substituir:

```ts
  warn: 'bg-[var(--warn)]/15 text-[var(--warn)] border border-[var(--warn)]/30',
```

por:

```ts
  warn: 'bg-[var(--warn)]/15 text-[var(--warn-text)] border border-[var(--warn)]/30',
```

Em `Badge.tsx:5`, atualizar o comentário do bloco `tones` para: `// variante -text em ok/err/accent/warn (o token base sobre o próprio tint falha AA em 12px).`

Em `Banner.tsx:7`, substituir:

```ts
  warn: { role: 'status', cls: 'bg-[var(--warn)]/15 text-[var(--warn)] border-b border-[var(--warn)]/30' },
```

por:

```ts
  warn: { role: 'status', cls: 'bg-[var(--warn)]/15 text-[var(--warn-text)] border-b border-[var(--warn)]/30' },
```

Em `ConsolePanel.tsx:23`, substituir:

```ts
  warn: 'text-[var(--warn)]',
```

por:

```ts
  warn: 'text-[var(--warn-text)]', // 12px normal não alcança 4.5:1 com --warn (§2.3)
```

Em `HitlGateBanner.tsx:22`, substituir:

```tsx
      className="ade-banner-in flex items-center gap-3 border-b border-[var(--warn)]/30 bg-[var(--warn)]/15 px-4 py-1.5 text-sm text-[var(--warn)]"
```

por:

```tsx
      className="ade-banner-in flex items-center gap-3 border-b border-[var(--warn)]/30 bg-[var(--warn)]/15 px-4 py-1.5 text-sm text-[var(--warn-text)]"
```

(Dot `bg-[var(--warn)]` na linha 24 e hover `hover:bg-[var(--warn)]/20` na linha 37 permanecem — são decorativos, não texto.)

- [ ] **Step 6: Verificar suite**

Run: `npm test` → 310+ passed (teste novo incluído); `npx tsc -b` → sem erros.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/ui/Badge.tsx frontend/src/shared/ui/Banner.tsx frontend/src/features/console/ConsolePanel.tsx frontend/src/features/hitl/HitlGateBanner.tsx frontend/src/features/dag/nodeAccent.ts frontend/src/features/dag/__tests__/nodeAccent.test.ts
git commit -m "style(ui): warn-text nos tons warn + variantes -text p/ todos os nós (AA)"
```

---

### Task 3: Raio unificado + duração/easing por token

**Files:**
- Modify: `frontend/src/shared/ui/Modal.tsx:64`
- Modify: `frontend/src/features/timeline/TimelineBar.tsx:77`
- Modify: `frontend/src/features/dag/AgentNode.tsx:45`
- Modify: `frontend/src/shared/ui/Button.tsx:24`
- Modify: `frontend/src/shared/ui/Select.tsx:11`
- Modify: `frontend/src/shared/ui/Input.tsx:14-21`
- Modify: `frontend/src/shared/ui/Textarea.tsx:13-20`
- Modify: `frontend/src/shared/ui/Toggle.tsx:21,26`
- Modify: `frontend/src/shared/ui/Topbar.tsx:123`
- Modify: `frontend/src/features/runs/NewRunForm.tsx:20`

**Interfaces:**
- Consumes: `--dur-fast`/`--dur-base`/`--dur-slow` (Task 1), `--radius-lg`/`--radius-md` (existem).

- [ ] **Step 1: Raio "large" único**

`Modal.tsx:64`: `rounded-lg` → `rounded-[var(--radius-lg)]` (string completa fica: `className="ade-modal-card-in w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elev)] shadow-[var(--shadow-modal)] outline-none"`).

`TimelineBar.tsx:77`: dentro da string da div, `rounded-lg` → `rounded-[var(--radius-lg)]`.

`AgentNode.tsx:45`: `rounded-xl` → `rounded-[var(--radius-md)]` (linha 45 fica: `'w-44 cursor-pointer rounded-[var(--radius-md)] border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 outline-none',`).

- [ ] **Step 2: Durações por token nos primitivos**

`Button.tsx:24`: `transition-colors duration-100` → `transition-colors duration-[var(--dur-fast)]`.

`Select.tsx:11`: `transition-colors duration-150` → `transition-colors duration-[var(--dur-base)]`.

`Input.tsx:15`: `transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]` → `transition-colors duration-[var(--dur-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`.

`Textarea.tsx:15`: idem (`duration-150` → `duration-[var(--dur-base)]`).

`Toggle.tsx:21` e `:26`: `transition-colors duration-150` → `transition-colors duration-[var(--dur-base)]` (2 ocorrências).

`Topbar.tsx:123`: `transition-colors duration-100` → `transition-colors duration-[var(--dur-fast)]`.

- [ ] **Step 3: NewRunForm (2 linhas)**

`NewRunForm.tsx:20`: `transition-colors duration-150` → `transition-colors duration-[var(--dur-base)]`.

`NewRunForm.tsx:60`: `transition-colors duration-150` → `transition-colors duration-[var(--dur-base)]`.

- [ ] **Step 4: Paridade de ring de erro (Input/Textarea)**

`Input.tsx:18`: `'border-[var(--err)] ring-1 ring-[var(--err)]/30'` → `'border-[var(--err)] ring-2 ring-[var(--err)]/40'`.

`Textarea.tsx:18`: idem.

- [ ] **Step 5: Verificar**

Run: `npm test` → 310+ passed; `npx tsc -b` → sem erros. Nenhum teste asserta classes visuais (verificado em recon: ui-kit.test só Button/Drawer/SplitPane; RunTabs.test asserta labels; ConsolePanel.test asserta textos).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/ui/Modal.tsx frontend/src/features/timeline/TimelineBar.tsx frontend/src/features/dag/AgentNode.tsx frontend/src/shared/ui/Button.tsx frontend/src/shared/ui/Select.tsx frontend/src/shared/ui/Input.tsx frontend/src/shared/ui/Textarea.tsx frontend/src/shared/ui/Toggle.tsx frontend/src/shared/ui/Topbar.tsx frontend/src/features/runs/NewRunForm.tsx
git commit -m "style(ui): raio large único + durações por token + ring de erro em paridade"
```

---

### Task 4: Consistência — CloseIcon, queued, Buttons, Select, EmptyState compact

**Files:**
- Create: `frontend/src/shared/ui/icons.tsx`
- Modify: `frontend/src/shared/ui/Drawer.tsx:47-49`
- Modify: `frontend/src/features/runs/RunTabs.tsx:97-99,101-111`
- Modify: `frontend/src/features/hitl/HitlGateBanner.tsx:33-40`
- Modify: `frontend/src/features/runs/RunsWorkspace.tsx:128-146`
- Modify: `frontend/src/features/runs/NewRunForm.tsx:17-20,46-55`
- Modify: `frontend/src/shared/ui/EmptyState.tsx`
- Modify: `frontend/src/features/console/ConsolePanel.tsx:193`
- Test: `frontend/src/shared/ui/__tests__/ui-kit.test.tsx` (estender)
- Test: `frontend/src/features/runs/__tests__/RunTabs.test.tsx` (estender)

**Interfaces:**
- Produces: `export function CloseIcon({ className }: { className?: string })` — SVG 14px inline, `stroke="currentColor"`, `aria-hidden="true"`; `EmptyState` ganha prop `compact?: boolean` (default false).

- [ ] **Step 1: Testes falhando**

`ui-kit.test.tsx` — adicionar import `EmptyState` e os testes:

```tsx
import { EmptyState } from '../EmptyState'
```

```tsx
  it('EmptyState default usa py-12; compact usa py-6 e título sm', () => {
    const { rerender } = render(<EmptyState title="vazio" />)
    expect(screen.getByText('vazio').parentElement?.className).toContain('py-12')
    rerender(<EmptyState title="vazio" compact />)
    expect(screen.getByText('vazio').parentElement?.className).toContain('py-6')
    expect(screen.getByText('vazio').className).toContain('text-sm')
  })
```

`RunTabs.test.tsx` — adicionar (mesmo arquivo, mesmo mock de store; fixture inline self-contained, sem depender de fixtures existentes):

```tsx
import type { Run } from '../../../shared/lib/types'

const queuedRun: Run = {
  id: 'q1',
  idea: 'queued run',
  stack: 'python',
  status: 'queued',
  duration_seconds: 0,
  created_at: '2026-08-13T00:00:00Z',
  updated_at: '2026-08-13T00:00:00Z',
}
```

```tsx
  it('não renderiza o span "queued" redundante quando a run está na fila', () => {
    render(<RunTabs runs={[queuedRun]} activeRunId="q1" queue={['q1']} cbByRun={{}} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText('queued')).toBeNull()
    expect(screen.getByText('Queued')).toBeInTheDocument()
  })
```

(Se o arquivo já importa `Run`/`vi`/`screen`, não duplicar imports.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/shared/ui/__tests__/ui-kit.test.tsx src/features/runs/__tests__/RunTabs.test.tsx`
Expected: FAIL no teste EmptyState (`compact` inexistente → TS error; ou py-6 não encontrado) e no teste queued (span ainda renderiza).

- [ ] **Step 3: Criar icons.tsx**

```tsx
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
```

- [ ] **Step 4: Aplicar CloseIcon + hit area**

`Drawer.tsx`: adicionar `import { CloseIcon } from './icons'`; linha 49 `✕` → `<CloseIcon />`.

`RunTabs.tsx`: adicionar `import { CloseIcon } from '../../shared/ui/icons'`; linha 110 `×` → `<CloseIcon />`.

`HitlGateBanner.tsx`: adicionar `import { CloseIcon } from '../../shared/ui/icons'`; linha 37 `p-0.5` → `p-1`; linha 39 `✕` → `<CloseIcon />`.

- [ ] **Step 5: Remover span queued redundante**

`RunTabs.tsx`: remover o bloco linhas 97-99:

```tsx
              {queued ? (
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">queued</span>
              ) : null}
```

(A variável `queued` linha 68 continua sendo usada? Após a remoção, `queued` deixa de ser usada — remover também a linha 68 `const queued = queue.includes(run.id)` e o prop `queue` continua no contrato (usado por `RunTabsProps` — manter o prop no contrato para não quebrar RunsWorkspace; adicionar comentário: `/** queue mantido no contrato p/ compat; UI usa o Badge de status. */`). Conferir que `RunTabsProps.queue` permanece declarado mas sem uso interno — se o lint ESLint reclamar de prop não usada, prefixar com underscore no destructuring: `queue: _queue`.)

- [ ] **Step 6: EmptyState compact**

`EmptyState.tsx` — substituir o arquivo inteiro por:

```tsx
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  /** Variante compacta (auditoria P0): py-6 + título sm — p/ áreas de altura fixa (console h-60). */
  compact?: boolean
}

// Estado vazio centralizado: título, descrição opcional e ação opcional.
export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 text-center ${compact ? 'py-6' : 'py-12'}`}>
      <h2 className={`font-semibold text-[var(--text)] ${compact ? 'text-sm' : 'text-base'}`}>{title}</h2>
      {description ? <p className="text-sm text-[var(--text-dim)]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
```

`ConsolePanel.tsx:193`:

```tsx
            <EmptyState title="No console output yet" />
```

→

```tsx
            <EmptyState compact title="No console output yet" />
```

- [ ] **Step 7: RunsWorkspace buttons + NewRunForm Select**

`RunsWorkspace.tsx`: substituir os dois `<button>` crus (linhas 130-136 e 137-143) por:

```tsx
                <Button variant="ghost" size="md" onClick={() => runDemo()}>
                  Run example pipeline
                </Button>
                <Button variant="subtle" size="md" onClick={() => document.getElementById('new-run-idea')?.focus()}>
                  Create new run
                </Button>
```

(Adicionar `import { Button } from '../../shared/ui/Button'` se ainda não importado — conferir imports do arquivo.)

`NewRunForm.tsx`: remover `selectCls` (linhas 17-20) e trocar os dois `<select>` (linhas 46-55) pelo componente compartilhado:

```tsx
      <Select aria-label="Stack" value={stack} onChange={(e) => setStack(e.target.value)}>
        {STACK_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </Select>
      <Select aria-label="Routing mode" value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}>
        {ROUTING_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </Select>
```

Com `import { Select } from '../../shared/ui/Select'`. (Nota: `px-1.5` do selectCls vira `px-2` do kit — diff visual mínimo, aceito pelo design.)

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run src/shared/ui/__tests__/ui-kit.test.tsx src/features/runs/__tests__/RunTabs.test.tsx src/features/runs/__tests__/NewRunForm.test.tsx src/features/runs/__tests__/RunsWorkspace.test.tsx src/features/console/__tests__/ConsolePanel.test.tsx`
Expected: PASS.

Run: `npm test` → 312+ passed; `npx tsc -b` → sem erros.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/shared/ui/icons.tsx frontend/src/shared/ui/Drawer.tsx frontend/src/shared/ui/EmptyState.tsx frontend/src/shared/ui/__tests__/ui-kit.test.tsx frontend/src/features/runs/RunTabs.tsx frontend/src/features/runs/__tests__/RunTabs.test.tsx frontend/src/features/runs/RunsWorkspace.tsx frontend/src/features/runs/NewRunForm.tsx frontend/src/features/hitl/HitlGateBanner.tsx frontend/src/features/console/ConsolePanel.tsx
git commit -m "style(ui): CloseIcon único, EmptyState compact, Button/Select nos runs, sem span queued"
```

---

### Task 5: Motion de estado (glow pulse, fade-in, dot, retry edge)

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/features/dag/AgentNode.tsx:44-52`
- Modify: `frontend/src/features/costs/CostBar.tsx:118`
- Modify: `frontend/src/features/dag/FlowCanvas.tsx:112-144`

**Interfaces:**
- Consumes: `--glow-accent` (Task 1), `--dur-slow` (Task 1), `--overlay-strong` (existe).

- [ ] **Step 1: Keyframes no tokens.css**

Adicionar após o bloco `.ade-fade-in` (linha 152):

```css
/* Glow pulsante do nó running (auditoria P0) — opacity oscila suave.
 * prefers-reduced-motion global zera (animation-duration: 0ms). */
@keyframes node-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.55; }
}
```

- [ ] **Step 2: AgentNode — glow tokenizado + pulse + fade-in**

`AgentNode.tsx:44-52` — substituir o bloco className por:

```tsx
      className={[
        'ade-fade-in w-44 cursor-pointer rounded-[var(--radius-md)] border border-t-[3px] bg-[var(--bg-elev)] px-3 py-2 outline-none',
        glow
          ? 'shadow-[var(--glow-accent)] animate-[node-pulse_2s_ease-in-out_infinite]'
          : 'shadow-[var(--shadow-node)]',
        'transition-[opacity,border-color,box-shadow,color] duration-[var(--dur-base)] ease-out',
        'hover:border-[var(--border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        ghosted ? 'pointer-events-none opacity-40' : '',
        selected ? 'ring-2 ring-[var(--accent)]' : '',
      ].join(' ')}
```

- [ ] **Step 3: CostBar dot transiciona**

`CostBar.tsx:118`: `className={`h-2 w-2 rounded-full ${barColor}`}` → `className={`h-2 w-2 rounded-full transition-colors duration-[var(--dur-slow)] ${barColor}`}`.

- [ ] **Step 4: FlowCanvas — aresta retry accent + minimap overlay token**

`FlowCanvas.tsx:112-118` — no `.map` dos edges, adicionar `style` próprio para a aresta de retry (mantendo `animated: e.id === 'retry->developer'` como está). O bloco atual:

```tsx
    setEdges(
      buildEdges(dagNodes).map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: e.id === 'retry->developer',
      })),
    )
```

vira:

```tsx
    setEdges(
      buildEdges(dagNodes).map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: e.id === 'retry->developer',
        style: e.id === 'retry->developer' ? { stroke: 'var(--accent)', strokeWidth: 2 } : undefined,
      })),
    )
```

`defaultEdgeOptions` (linha 135) permanece inalterado — as demais arestas herdam `stroke: var(--border), strokeWidth: 1.5` dele.

`FlowCanvas.tsx:143`: `maskColor="rgb(0 0 0 / 0.6)"` → `maskColor="var(--overlay-strong)"`.

- [ ] **Step 5: Verificar**

Run: `npm test` → 312+ passed; `npx tsc -b` → sem erros. (Nenhum teste asserta classes desses componentes — confirmado em recon.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/src/features/dag/AgentNode.tsx frontend/src/features/costs/CostBar.tsx frontend/src/features/dag/FlowCanvas.tsx
git commit -m "style(dag): glow pulse + fade-in, dot de custo transiciona, aresta retry accent"
```

---

## Self-Review Notes

- Spec coverage: itens 1-10 do spec mapeiam Tasks 1-5 (T1: itens 3+6+9; T2: item 1; T3: itens 2+3; T4: itens 4+5+7+8; T5: item 10).
- `data-testid` não alterado em nenhuma task.
- Testes afetados só em T2 (novo nodeAccent.test) e T4 (ui-kit + RunTabs estendidos).
