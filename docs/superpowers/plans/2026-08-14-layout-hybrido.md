# Layout Híbrido — Implementation Plan (Spec S1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o workspace em layout híbrido (rail 48px + sub-sidebar 260px + RunTabs + inspector direito 300px colapsável + panel bottom ícone-only + budget pill flutuante + palette ⌘K MVP), sem quebrar fluxos existentes.

**Architecture:** Shell novo em `App.tsx` (rail + sidebar host + inspector + bottom bar) substituindo a nav inline da topbar; views continuam os mesmos componentes (drawers); CostBar vira pill flutuante; console mantém SplitPane. Estado de navegação migra de 13 useState para um `viewStore` Zustand. Palette MVP com registro estático de comandos.

**Tech Stack:** React 19, Tailwind v4 (tokens `var(--…)` em src/styles/tokens.css), Zustand, React Query, vitest. Verificação: `npm test` (vitest run) e `npm run build` (tsc -b && vite build) em `frontend/`.

**Spec:** `docs/superpowers/specs/2026-08-14-pipeline-studio-design.md` (seções S1, fase 0, fase 1, fase 5-parcial). Mockup conceitual: `/tmp/opencode/layout-proposals/5-hybrid.html` (referência visual, NÃO pixel-perfect).

## Global Constraints

- Baseline: 322 testes passam + build ok ANTES de qualquer mudança (rodar e confirmar).
- Não quebrar fluxos atuais: NewRunForm (textareas/presets/stack/routing), RunTabs, drawers das 13 views, Focus mode, HITL, TimelineBar, consoleStore.
- Zero novas dependências npm.
- Todo texto de UI em inglês (padrão pós-fix); monogramas em vez de emoji.
- Components usam tokens do design system (`var(--bg-elev)`, `--border`, `--accent`, `--dur-fast`, `--text-2xs`, `--ease-out`) — sem hex hardcoded.
- Visual: ícones inline stroke currentColor (padrão Topbar ICONS); tooltip obrigatório em qualquer controle ícone-only; estados ativo = `bg-[var(--bg-elev-2)]` + texto full.
- Cada task termina com testes verdes + commit. Commits por task, mensagem `feat(ade): …` (repo usa prefixos feat/docs/fix).

---
---

### Task 1: Fase 0 — Auditoria de identidade visual + tokens do shell

**Files:**
- Modify: `frontend/src/styles/tokens.css` (se precisar de tokens novos)
- Create: `frontend/docs/ade-shell-visual.md` (notas do designer, curtas)

**Interfaces:**
- Consumes: tokens existentes (bg #09090b, bg-elev, bg-elev-2, border, accent, accent-text, text, text-dim, dur-fast, ease-out, text-2xs).
- Produces: direção visual do shell (rail/sidebar/inspector/bottom-bar/pill): dimensões, espaçamentos, estados hover/ativo/focus, tipografia — seguida pelas tasks 2-7.

- [ ] **Step 1: Auditoria** — revisar tokens.css + componentes compartilhados (Topbar, Drawer, Button, SectionTitle, EmptyState, monogramas) e listar inconsistências visuais atuais (hex hardcoded, tokens órfãos, hierarquia).
- [ ] **Step 2: Definir spec visual do shell** — documentar: rail 48px (ícone 20px, barra ativa accent 2px esquerda), sub-sidebar 260px (header padrão: título + close, conteúdo scroll `[scrollbar-gutter:stable]`), inspector 300px (mesmo header), bottom bar (tabs ícone-only 32px, ativo accent + barra top 2px), budget pill (dark border, mono). Adicionar tokens ao tokens.css SOMENTE se faltar (ex.: `--rail-w`), sem duplicar.
- [ ] **Step 3: Verificar** — `npm test` (suite completa, baseline verde) + `npm run build`.
- [ ] **Step 4: Commit** — `git add frontend/src/styles/tokens.css docs/` → `git commit -m "docs(ade): spec visual do shell híbrido (fase 0)"`

---

### Task 2: viewStore + ActivityRail (rail 48px icon-only)

**Files:**
- Create: `frontend/src/stores/viewStore.ts`
- Create: `frontend/src/stores/__tests__/viewStore.test.ts`
- Create: `frontend/src/shared/ui/ActivityRail.tsx`
- Create: `frontend/src/shared/ui/__tests__/ActivityRail.test.tsx`
- Modify: `frontend/src/shared/ui/Topbar.tsx` — exportar `ICONS` (ou mover p/ `shared/ui/icons.tsx`) para reuso no rail
- Modify: `frontend/src/app/App.tsx` — substituir os 13 useState por viewStore; montar rail à esquerda do main

**Interfaces:**
- Consumes: `WORKSPACE_GROUPS` (App.tsx:41-70 — mover p/ `viewStore.ts` ou novo `src/shared/lib/views.ts`); `TopbarAction` (reuso com `showLabel={false}`).
- Produces:
  - `ViewKey` = `'runs' | 'prompt' | 'agents' | 'pipelines' | 'artifacts' | 'terminal' | 'ast' | 'coverage' | 'docker' | 'trajectories' | 'mcp' | 'memory' | 'evals' | 'git' | 'health' | 'prompts' | 'settings'`
  - `useViewStore`: `{ activeView: ViewKey | null; openView(v: ViewKey): void; closeView(): void }` — semântica: `openView(ativa)` fecha se já ativa; `openView(nova)` troca; `closeView()` = null.
  - `<ActivityRail active={ViewKey|null} onSelect={(v)=>void} />` — botões 48px, tooltip (title+aria-label), ativo = barra accent 2px à esquerda (`before:` absolute) + `bg-[var(--bg-elev)]`, grupos com separadores (padrão WORKSPACE_GROUPS). Ícones reusados do Topbar.
  - `VIEWS_META: Record<ViewKey, { label: string; icon: keyof typeof ICONS }>` em `src/shared/lib/views.ts` (fonte única; WORKSPACE_GROUPS derivado dela).

- [ ] **Step 1: Testes do store (falham primeiro)** — `viewStore.test.ts`: `openView('memory')` seta ativa; `openView('memory')` de novo → fecha (null); `openView('git')` após `openView('memory')` → troca; `closeView()` → null. Rodar: `npx vitest run src/stores/__tests__/viewStore.test.ts` → FAIL (módulo não existe).
- [ ] **Step 2: Implementar** — `viewStore.ts` (Zustand, padrão canvasStore) + mover WORKSPACE_GROUPS p/ `src/shared/lib/views.ts` (adicionando runs/prompt/agents/pipelines como grupo "Pipeline" no topo, ícones: runs=terminal? NÃO — designer escolhe ícones inline novos p/ runs/prompt/agents/pipelines e os adiciona ao ICONS exportado).
- [ ] **Step 3: Testes do rail (falham primeiro)** — `ActivityRail.test.tsx`: renderiza todos os ViewKeys com aria-label; clique chama onSelect com a key; ativo tem `aria-pressed=true`; ícone ativo renderiza barra accent (assert via `data-active="true"` attribute no botão).
- [ ] **Step 4: Implementar** — `ActivityRail.tsx` (usa TopbarAction p/ cada view com `showLabel={false}`, wrapper 48px, `data-active` attr).
- [ ] **Step 5: Integrar no App** — remover os 13 `useState` + `openView`/`viewsOpen`; usar `useViewStore`; render `<ActivityRail>` à esquerda (coluna 48px, border-r); manter drawers das views (abrem via `openView` na fase atual: `openView(k)` também dispara o drawer — comportamento preservado nesta task; SidebarHost entra na Task 3).
- [ ] **Step 6: Verificar** — `npx vitest run src/stores/__tests__/viewStore.test.ts src/shared/ui/__tests__/ActivityRail.test.tsx` PASS; depois `npm test` full (ajustar testes que quebraram: RunsWorkspace.test/ui-kit se assertavam nav na topbar) + `npm run build`.
- [ ] **Step 7: Commit** — `feat(ade): rail de atividade + viewStore (S1)`

---

### Task 3: SidebarHost — sub-sidebar 260px por view

**Files:**
- Create: `frontend/src/shared/ui/SidebarHost.tsx`
- Create: `frontend/src/shared/ui/__tests__/SidebarHost.test.tsx`
- Modify: `frontend/src/app/App.tsx` — renderizar SidebarHost entre rail e main quando `activeView !== null`

**Interfaces:**
- Consumes: `useViewStore` (Task 2), drawers existentes das 13 views (props `open/onClose`), `NewRunForm` (para view 'prompt').
- Produces:
  - `<SidebarHost active={ViewKey|null} onClose={():void} onExpand={():void} />` — 260px, border-r, header padrão (título da view + botão close + botão "Expand" quando aplicável), conteúdo:
    - **Views leves (conteúdo direto):** `prompt` → NewRunForm (props `onCreated`), `memory`, `health`, `prompts`, `settings`, `git` → componente existente em modo inline (recebe `open={true}`; o painel decide scroll interno).
    - **Views pesadas (resumo + Expand):** `artifacts`, `terminal`, `ast`, `coverage`, `docker`, `mcp`, `evals`, `trajectories`, `runs` → bloco resumo (título + contador de items se barato) + botão "Open panel" que chama `onExpand`.
  - `onExpand` no App: abre o Drawer existente da view (mesmo `openView` da Task 2).
- Comportamento: Esc fecha (padrão Drawer); uma sidebar por vez (viewStore já garante); `aria-label` = título da view.

- [ ] **Step 1: Testes (falham primeiro)** — `SidebarHost.test.tsx`: com `active='prompt'` renderiza NewRunForm (getByLabelText p/ 'Idea'/textbox do form — conferir label real no NewRunForm); com `active='artifacts'` renderiza resumo + botão "Open panel" que chama `onExpand`; close chama `onClose`.
- [ ] **Step 2: Implementar** — SidebarHost com mapa view→modo (`'inline' | 'summary'`), header padrão, conteúdo por view.
- [ ] **Step 3: Integrar** — App: coluna [rail 48px][sidebar 260px quando ativa][main flex-1]; `onExpand` abre drawer da view (reutilizar lógica da Task 2); manter drawers existentes intactos.
- [ ] **Step 4: Verificar** — testes novos PASS + full suite + build.
- [ ] **Step 5: Commit** — `feat(ade): sub-sidebar 260px por view (S1)`

---

### Task 4: Topbar nova + BudgetPill flutuante

**Files:**
- Modify: `frontend/src/shared/ui/Topbar.tsx` — novo prop `center?: ReactNode` (trigger ⌘K); remover `right` p/ CostBar/nav (manter API `right` p/ compat: Focus permanece via right)
- Create: `frontend/src/features/costs/BudgetPill.tsx`
- Create: `frontend/src/features/costs/__tests__/BudgetPill.test.tsx`
- Modify: `frontend/src/app/App.tsx` — CostBar sai da topbar → BudgetPill no canto inferior esquerdo do canvas; Topbar recebe trigger ⌘K (palette = Task 7; trigger abre palette se existir, senão no-op com title "Command palette (coming in task 7)" — implementar junto na Task 7 e aqui apenas o slot)

**Interfaces:**
- Consumes: `CostBar` interna (query `run-cost`, refetch 5s running, costModel: `costForNode/formatUsd/budgetPercent/hardStopLevel`), `useBudgetOverrideStore.openOverride(runId)`.
- Produces:
  - `<BudgetPill runId={string|null} onOverride={():void} />` — `absolute bottom-3 left-3 z-20` sobre o canvas (dentro da região canvas), pill dark (`border border-[var(--border)] bg-[var(--bg-elev)] rounded-full px-3 py-1.5 shadow-[var(--shadow-xs)]`), conteúdo: `Budget {formatUsd(spent)} · {formatUsd(max)}` + mini-meter 4 segmentos (divs `h-1 w-2 rounded` accent/ok→warn) + tooltip; vazio → dot discreto (padrão CostBar); clique abre override.
  - `useBudgetStore`: extrair spent/max do mesmo endpoint do CostBar — reusar a query do CostBar via hook compartilhado OU duplicar query com mesmo queryKey (react-query dedupe): duplicar queryKey `['run-cost', runId]` é aceitável e mais simples.

- [ ] **Step 1: Testes (falham primeiro)** — `BudgetPill.test.tsx`: mock query run-cost (spent 0.42, max 1.00) → renderiza "Budget $0.42 · $1.00" + 4 segmentos com 42% ativos (`data-meter` attrs); empty (sem data) → dot discreto; clique → `onOverride` chamado.
- [ ] **Step 2: Implementar** — BudgetPill (usa useQuery mesma key do CostBar + costModel).
- [ ] **Step 3: Integrar** — App: remover `<CostBar />` do Topbar right; render `<BudgetPill>` dentro de `canvasRegion` (App.tsx:243-255, wrapper absolute); Topbar ganha `center` (trigger ⌘K placeholder nesta task — desabilitado com title).
- [ ] **Step 4: Verificar** — testes novos PASS; ajustar `CostBar.test.tsx` se assertou posição na topbar; full suite + build.
- [ ] **Step 5: Commit** — `feat(ade): budget pill flutuante no canvas (S1)`

---

### Task 5: RunInspector — painel direito 300px colapsável (sem console)

**Files:**
- Create: `frontend/src/features/dag/RunInspector.tsx`
- Create: `frontend/src/features/dag/__tests__/RunInspector.test.tsx`
- Modify: `frontend/src/app/App.tsx` — render RunInspector à direita do main (coluna 300px colapsável)

**Interfaces:**
- Consumes: `useRunsStore` (runs, activeRunId), query `['run-cost', runId]` (mesma do CostBar — dedupe), `costModel` (costForNode/formatUsd/budgetPercent/hardStopLevel), `NODE_LABELS/PIPELINE_ORDER` (dagModel), `useCanvasStore` (selectedNodeId p/ highlight opcional).
- Produces:
  - `<RunInspector />` — colapsável: botão chevron no header (padrão ConsolePanel chevronCls), `data-testid="run-inspector"`; colapsado = só header (altura 36px, `aria-expanded`); expandido: seções **Run details** (status badge tone nodeStatusMeta, id mono shortId, stack, elapsed, step/nodes count) + **Budget & Cost** (meter gradiente ok→warn (hardStopLevel), rows por nó de PIPELINE_ORDER com `costForNode` + barra proporcional `data-cost-row`). SEM console.
  - Estado colapsado local (useState) + atalho ⌘I registrado na Task 7 (aqui só o botão).

- [ ] **Step 1: Testes (falham primeiro)** — `RunInspector.test.tsx`: com run ativa + cost mock → renderiza "Run details", status, e rows de custo (assert `data-cost-row` count = PIPELINE_ORDER.length e formato `formatUsd`); clique no chevron → colapsa (`aria-expanded=false` + rows ausentes); sem run ativa → renderiza empty discreto.
- [ ] **Step 2: Implementar** — RunInspector (padrão visual do Task 1; header = SectionTitle + chevron).
- [ ] **Step 3: Integrar** — App: coluna direita `w-[300px] border-l` quando `inspectorOpen` (estado local no App ou no viewStore? → estado local `useState` no App + botão no Topbar right (subtle, "Inspector")); InspectDrawer (por nó) permanece portal z-50 por cima.
- [ ] **Step 4: Verificar** — testes PASS + full suite + build.
- [ ] **Step 5: Commit** — `feat(ade): run inspector direito colapsável (S1)`

---

### Task 6: Panel bottom ícone-only (console + terminal + erros)

**Files:**
- Modify: `frontend/src/features/console/ConsolePanel.tsx` — header vira barra de tabs ícone-only (console ativo + terminal + contador de erros), filtros internos permanecem (chips) abaixo
- Modify: `frontend/src/features/console/__tests__/ConsolePanel.test.tsx` — ajustar asserts do header se quebrar
- Create: `frontend/src/shared/ui/IconTabBar.tsx` (reutilizável) + teste

**Interfaces:**
- Consumes: `useConsoleStore` (entries/streams/filters/clear), `TerminalPanel` (drawer), `NODE_LABELS`.
- Produces:
  - `<IconTabBar items={[{key,label,icon,count?,active,onClick}]} />` — 32px tabs, ícone-only, tooltip (title+aria-label), ativo = `text-[var(--accent)]` + barra top 2px (`after:`), count em badge mono (erros).
  - Ícones custom inline (NÃO VS Code): console = `>` chevron, terminal = janela (`<rect>`+`<polyline>`), erros = lista com dot.

- [ ] **Step 1: Testes (falham primeiro)** — `IconTabBar.test.tsx`: renderiza items com aria-label, count aparece, clique chama onClick, ativo tem `aria-pressed`.
- [ ] **Step 2: Implementar** — IconTabBar.
- [ ] **Step 3: Refatorar ConsolePanel** — header atual (título + filtros + chevron) vira: IconTabBar (Console ativo, Terminal → `onClick` abre TerminalPanel drawer via prop nova `onOpenTerminal`, badge = count de entries level error) + chips de filtro mantidos; retrátil/auto-expand preservados.
- [ ] **Step 4: Verificar** — testes novos + ConsolePanel.test PASS (ajustar asserts de header) + full suite + build.
- [ ] **Step 5: Commit** — `feat(ade): panel bottom ícone-only (S1)`

---

### Task 7: Command Palette ⌘K (MVP)

**Files:**
- Create: `frontend/src/shared/lib/commands.ts`
- Create: `frontend/src/shared/lib/__tests__/commands.test.ts`
- Create: `frontend/src/shared/ui/CommandPalette.tsx`
- Create: `frontend/src/shared/ui/__tests__/CommandPalette.test.tsx`
- Modify: `frontend/src/app/App.tsx` — montar palette + trigger ⌘K na Topbar (slot da Task 4) + listener global

**Interfaces:**
- Consumes: `useViewStore`, `useBudgetOverrideStore.openOverride(activeRunId)`, `useConsoleStore` (toggle via getState), estado inspector (Task 5), `NewRunForm` (foco `#new-run-idea`).
- Produces:
  - `COMMANDS: Command[]` estático: `{ id, title, kbd?: string, keywords: string[], run: (ctx) => void }` — comandos: Nova run (foca `new-run-idea`), Navegar views (runs/prompt/memory/health/settings — via openView), Toggle console, Toggle inspector, Focus mode (toggleFullscreen), Budget override, Fechar palette.
  - `<CommandPalette open onClose={():void} />` — 560px centered, input filtro (case-insensitive por title+keywords), lista com kbd à direita, seta ↑↓ + Enter + Esc; overlay `--overlay`; `role="dialog" aria-modal`.
  - Listener global ⌘K/Ctrl+K em App (abre; preventDefault), Esc fecha.

- [ ] **Step 1: Testes (falham primeiro)** — `commands.test.ts`: registro tem ids únicos; filtro por keyword retorna item; `run` chama ação esperada (ctx mock).
- [ ] **Step 2: Testes da UI (falham primeiro)** — `CommandPalette.test.tsx`: renderiza input + comandos filtrados; digitar filtra; ↑↓ move seleção (`aria-selected`); Enter executa (spy no ctx/action); Esc chama onClose.
- [ ] **Step 3: Implementar** — commands.ts + CommandPalette.tsx.
- [ ] **Step 4: Integrar** — App: `paletteOpen` state + listener ⌘K + trigger central na Topbar (`center` prop): `⌘K` + texto "Open command palette…" (botão subtle, largura ~260px).
- [ ] **Step 5: Verificar** — testes PASS + full suite + build.
- [ ] **Step 6: Commit** — `feat(ade): command palette ⌘K (S1/MVP)`

---

### Task 8: Integração final + polish + verificação

**Files:**
- Modify: ajustes finos de coerência visual nos componentes do shell (designer), conforme Task 1

**Interfaces:**
- Consumes: tudo das tasks 2-7.

- [ ] **Step 1: Reviewer visual (designer)** — revisar app rodando (playwright + screenshot p/ cada estado: rail/sidebar/inspector/palette/pill/bottom bar) contra o spec da Task 1; corrigir inconsistências (espaçamento, estados, hierarquia).
- [ ] **Step 2: Full verification** — `npm test` (suite completa: 322+novos, zero fail) + `npm run build` limpo.
- [ ] **Step 3: Check regressões** — fluxos manuais via playwright: nova run (form na sub-sidebar prompt + foco via palette), run demo, drawer de view pesada via Expand, inspeção de nó (InspectDrawer por cima do inspector), HITL banner, console retrátil, focus mode.
- [ ] **Step 4: Commit final** — `feat(ade): shell híbrido completo (S1)`

---
---

## Self-review notes

- **Spec coverage:** S1 completo (rail/sub-sidebar T2-3; topbar+trigger T4/T7; budget pill T4; inspector sem console T5; panel bottom ícone-only T6; palette MVP T7; RunTabs já existente — preservado, sem task); fase 0 = T1; fase 5 (palette avançada: registro extensível, atalhos completos) = planos futuros (nota: MVP incluído p/ trigger funcional).
- **Não quebra:** 13 views/drawers, NewRunForm, consoleStore, HITL, TimelineBar, Focus — todos preservados por design; baseline 322 testes re-verificada na T1 e T8.
- **Fora deste plano:** split paralelo visual (S4), CRUD agentes (S2), editor pipelines (S3) — planos próprios.
