# LoopForge ADE — Polish Pass (P0) — Design

> Data: 2026-08-13 · Status: aprovado (escopo P0) · Repo: loopforge-ade (frontend)

## Objetivo

Camada de polish visual sobre o tema dark atual (zinc + indigo). Sem redesign, sem light theme, sem mudança de layout/arquitetura, sem novas dependências (CSS-only). Resultado: contraste AA corrigido, tokens de motion/raio unificados, micro-interações de estado, consistência de primitivos.

## Global Constraints

- CSS-only: zero dependências novas; keyframes/transitions via `styles/tokens.css`.
- `prefers-reduced-motion` já zera animações globalmente — todo motion novo deve usar essa infra.
- UI strings em **inglês**; comentários de código em **português** — manter.
- Nenhum `data-testid` pode ser alterado/removido (verificado: nenhum teste depende de classes visuais).
- Verificação obrigatória: `npm test` (309+) + `npx tsc -b` verdes antes do commit.
- Contrato de props dos primitivos só pode ser ESTENDIDO (prop nova com default), nunca quebrado.

## Escopo P0 (10 itens)

### 1. Contraste: warn-text + variantes -text de nós (D4, D5)

Problema: `--warn` (amber-600) usado como texto em Badge/Banner/Console/HitlGateBanner → falha AA em 12px; 5 node-accents sem variante -text para labels.

- `tokens.css`: adicionar `--node-test-writer-text: #f9a8d4`, `--node-developer-text: #34d399`, `--node-retry-text: #fb7185`, `--node-parallel-audit-text: #2dd4bf`, `--node-pm-text: #38bdf8`, `--node-qa-text: #fbbf24` (ao lado dos `--node-*` base).
- `nodeAccent.ts`: registrar as variantes -text (mesmo caminho já usado por entry/cpo/tech_lead).
- `Badge.tsx`, `Banner.tsx`, `ConsolePanel.tsx`, `HitlGateBanner.tsx`: texto tone warn → `var(--warn-text)` (amber-400); dot/ícone mantêm `--warn` base. `CostBar.tsx`: dot mantém base, texto segue o padrão.

Arquivos: `styles/tokens.css`, `dag/nodeAccent.ts`, `ui/Badge.tsx`, `ui/Banner.tsx`, `console/ConsolePanel.tsx`, `hitl/HitlGateBanner.tsx`, `costs/CostBar.tsx`. Risco: low.

### 2. Raio "large" unificado (D1)

Problema: `--radius-lg` (12px) vs `rounded-lg` Tailwind (8px) em Modal/Timeline vs `rounded-xl` em AgentNode.

- `Modal.tsx:64`, `TimelineBar.tsx:77`: `rounded-lg` → `rounded-[var(--radius-lg)]` (12px).
- `AgentNode.tsx:45`: `rounded-xl` → `rounded-[var(--radius-md)]` (6px, interativo).
- `tokens.css`: comentário na escala de raio explicitando "large = 12px, único".

Arquivos: `styles/tokens.css`, `ui/Modal.tsx`, `timeline/TimelineBar.tsx`, `dag/AgentNode.tsx`. Risco: low.

### 3. Tokens de duração/easing + easing único (D2, D6)

Problema: `duration-100`/`duration-150` soltos e 3 easings diferentes.

- `tokens.css`: adicionar `--dur-fast: 100ms`, `--dur-base: 150ms`, `--dur-slow: 250ms`, `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.
- Substituir `duration-*` soltas por `duration-[var(--dur-*)]` em: `Button.tsx` (fast), `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Toggle.tsx`, `Topbar.tsx` (TopbarAction), `NewRunForm.tsx` (base).
- `tokens.css:173` (`ade-modal-in`): `ease-out` → `var(--ease-out)`.

Arquivos: `styles/tokens.css`, `ui/Button.tsx`, `ui/Input.tsx`, `ui/Select.tsx`, `ui/Textarea.tsx`, `ui/Toggle.tsx`, `ui/Topbar.tsx`, `runs/NewRunForm.tsx`. Risco: low.

### 4. Remover redundância "queued" na tab (E2)

Problema: `RunTabs.tsx:88,97-99` renderiza Badge "Queued" (info) + span "queued" (10px uppercase) simultâneos.

- Manter **o Badge**; remover o span redundante.

Arquivos: `runs/RunTabs.tsx`. Risco: low.

### 5. EmptyState actions com Button + NewRunForm com Select (S3, S4)

Problema: 2 `<button>` crus com classes manuais em RunsWorkspace; `selectCls` local no NewRunForm duplicando `Select` compartilhado.

- `RunsWorkspace.tsx:129-145`: trocar pelos `<Button variant="ghost">` / `<Button variant="primary">`.
- `NewRunForm.tsx:19-20,46,51`: remover `selectCls`, usar `Select` compartilhado.

Arquivos: `runs/RunsWorkspace.tsx`, `runs/NewRunForm.tsx`. Risco: low.

### 6. Tokens de glow/minimap (D3)

Problema: RGB hardcoded — glow do nó running (`AgentNode.tsx:46`) e mask do minimap (`FlowCanvas.tsx:143`).

- `tokens.css`: `--glow-accent: 0 0 0 1px var(--accent), 0 0 14px rgb(79 70 229 / 0.35)`.
- `AgentNode.tsx:46`: usar `var(--glow-accent)`; `FlowCanvas.tsx:143`: usar `var(--overlay-strong)`.

Arquivos: `styles/tokens.css`, `dag/AgentNode.tsx`, `dag/FlowCanvas.tsx`. Risco: low.

### 7. EmptyState compact (S1)

Problema: `EmptyState.tsx:12` py-12 domina o console h-60 (`ConsolePanel.tsx:193`).

- `EmptyState.tsx`: nova prop `compact?: boolean` (default false) → `py-6`, title `text-sm`.
- `ConsolePanel.tsx:193`: `<EmptyState compact ... />`.

Arquivos: `ui/EmptyState.tsx`, `console/ConsolePanel.tsx`. Risco: low.

### 8. Close glyph único + hit area 24px (A1, A2)

Problema: `×` (RunTabs) vs `✕` (Drawer, HitlGateBanner); hit area do close do banner ~20px.

- `Drawer.tsx:49`: trocar `✕` por SVG inline (stroke currentColor, 14px).
- `RunTabs.tsx:110`, `HitlGateBanner.tsx:39`: reutilizar o mesmo SVG.
- `HitlGateBanner.tsx:37`: `p-0.5` → `p-1` (24px).

Arquivos: `ui/Drawer.tsx`, `runs/RunTabs.tsx`, `hitl/HitlGateBanner.tsx`. Risco: low.

### 9. Scrollbar 8px + ::selection (D7, D8)

Problema: scrollbar 10px com thumb quase invisível; sem ::selection.

- `tokens.css:112-133`: width 8px, thumb `var(--border-hover)`, hover `var(--text-dim)`/40.
- `tokens.css`: `::selection { background: color-mix(in srgb, var(--accent) 30%, transparent); }`.

Arquivos: `styles/tokens.css`. Risco: low.

### 10. Transições de estado (M1, M2, c2, c3, c4, d1, d4)

Problema: status do nó troca sem transição; aresta retry usa cor default igual às estáticas; sem feedback de vida.

- `tokens.css`: keyframes `node-pulse` (glow running oscila opacity 0.35→0.5, 2s ease-in-out infinite) e `ade-fade-in` (150ms).
- `AgentNode.tsx:46`: glow running ganha `animation: node-pulse ...`; nó ganha `ade-fade-in` no mount.
- `CostBar.tsx:118`: dot ganha `transition-colors duration-[var(--dur-slow)]`.
- `FlowCanvas.tsx:116,135`: aresta retry→dev `stroke: var(--accent)` + strokeWidth 2 (mantém `animated`).

Arquivos: `styles/tokens.css`, `dag/AgentNode.tsx`, `costs/CostBar.tsx`, `dag/FlowCanvas.tsx`. Risco: low.

## Fora de escopo (P1, segunda onda)

- Skeleton component + refactor dos 9 loading states (b8).
- ModalHeader primitivo (b1) + Modal max-height/scroll (b10).
- Padronizar eyebrows em 10px (c8).
- Button `active:scale-[0.98]` + Toggle refinamentos (b6/b7).
- Constantes de z-index (c9).

## Critérios de pronto

1. Todos os 10 itens implementados com os caminhos exatos acima.
2. `npm test` verde (≥309) + `npx tsc -b` sem erros.
3. Zero dependências novas; zero `data-testid` alterado.
4. `prefers-reduced-motion` continua zerando animações.
5. UI strings EN, comentários PT.
