# Visual & UX/UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar overhaul completo de design e estética na interface web do LoopForge ADE (Canvas/Nodes, Topbar/Rail Shell, Painéis de Dados e Terminal/Console).

**Architecture:** 
- **Tokens**: Estender `tokens.css` com animações de arestas de fluxo, brilho orgânico, classes de glassmorphism e tags `kbd`.
- **DAG Nodes**: Enriquecer `AgentNode` e `SplitNode` com ícones de personas, badges e dots pulsantes, gradientes superiores e controles flutuantes translúcidos no `FlowCanvas`.
- **Shell**: Elevar `Topbar`, `RailNav` e `CommandPalette` para visual translúcido `backdrop-blur-xl` com destaque ativo deslizante e visual Raycast.
- **Painéis**: Reformular `CoveragePanel` (gauge de progresso com degradê), `GitPanel` (timeline conectada), `MemoryPanel` e `ArtifactsPanel` (ícones de arquivos).

**Tech Stack:** React 19, Tailwind CSS v4, Lucide/Heroicons SVG, React Flow v12, Zustand.

---

### Task 1: Tokens de Animação, Glassmorphism & Estilos Globais

**Files:**
- Modify: `web/loopforge-ade/frontend/src/styles/tokens.css`
- Modify: `web/loopforge-ade/frontend/src/styles/index.css`

**Interfaces:**
- Produces: Classes utilitárias `.ade-glass`, `.ade-edge-pulse`, `.ade-kbd`, `.ade-live-dot` e tokens de degradê por nó.

- [ ] **Step 1: Adicionar classes e keyframes de glassmorphism e pulso em tokens.css**
- [ ] **Step 2: Verificar sintaxe CSS sem erros de build**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npm run build`
- [ ] **Step 3: Commit**
  `git add frontend/src/styles/ && git commit -m "feat(ui): design tokens de glassmorphism, pulse de arestas e tags kbd"`

---

### Task 2: Overhaul do Canvas, AgentNode e SplitNode (P1)

**Files:**
- Modify: `web/loopforge-ade/frontend/src/features/dag/AgentNode.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/dag/SplitNode.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/dag/FlowCanvas.tsx`
- Test: `web/loopforge-ade/frontend/src/features/dag/__tests__/AgentNode.test.tsx`

**Interfaces:**
- Produces: `NODE_PERSONA_ICONS`, card de agente com gradiente superior, dot pulsante de status, controles flutuantes com `backdrop-blur`.

- [ ] **Step 1: Adicionar ícones de persona e indicadores visuais nos nós**
- [ ] **Step 2: Estilizar controles do FlowCanvas com visual translúcido**
- [ ] **Step 3: Rodar testes do módulo DAG**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run src/features/dag/__tests__/`
- [ ] **Step 4: Commit**
  `git add frontend/src/features/dag/ && git commit -m "feat(ui): visual overhaul de nós do DAG com ícones de persona e glass controls"`

---

### Task 3: Shell Glassmorphism, Topbar, RailNav & CommandPalette (P2)

**Files:**
- Modify: `web/loopforge-ade/frontend/src/features/topbar/Topbar.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/sidebar/RailNav.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/topbar/CommandPalette.tsx`
- Test: `web/loopforge-ade/frontend/src/features/topbar/__tests__/`
- Test: `web/loopforge-ade/frontend/src/features/sidebar/__tests__/`

**Interfaces:**
- Produces: Topbar translúcida com linha de luz 1px, RailNav com indicador iluminado e CommandPalette com visual Raycast.

- [ ] **Step 1: Implementar visual translúcido na Topbar e RailNav**
- [ ] **Step 2: Estilizar atalhos `kbd` e layout da CommandPalette**
- [ ] **Step 3: Rodar testes de topbar e sidebar**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run src/features/topbar/__tests__/ src/features/sidebar/__tests__/`
- [ ] **Step 4: Commit**
  `git add frontend/src/features/topbar/ frontend/src/features/sidebar/ && git commit -m "feat(ui): topbar translúcida, rail nav com indicador de luz e palette raycast"`

---

### Task 4: Modernização dos Painéis de Dados (Coverage, Git, Memory, Artifacts) (P3)

**Files:**
- Modify: `web/loopforge-ade/frontend/src/features/coverage/CoveragePanel.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/git/GitPanel.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/memory/MemoryPanel.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/artifacts/ArtifactsPanel.tsx`
- Test: `web/loopforge-ade/frontend/src/features/coverage/__tests__/`
- Test: `web/loopforge-ade/frontend/src/features/git/__tests__/`

**Interfaces:**
- Produces: Barras de progresso com degradê no Coverage, timeline vertical no Git, cards estilizados no Memory e ícones de arquivo no Artifacts.

- [ ] **Step 1: Estilizar CoveragePanel com gauge moderno e degradê emerald→teal**
- [ ] **Step 2: Implementar timeline conectada no GitPanel e file icons no ArtifactsPanel**
- [ ] **Step 3: Rodar testes dos painéis**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run src/features/coverage/__tests__/ src/features/git/__tests__/ src/features/memory/__tests__/ src/features/artifacts/__tests__/`
- [ ] **Step 4: Commit**
  `git add frontend/src/features/ && git commit -m "feat(ui): data viz cards em coverage, git timeline conectada e file icons"`

---

### Task 5: Console & Terminal Glass Styling

**Files:**
- Modify: `web/loopforge-ade/frontend/src/features/console/ConsolePanel.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/terminal/TerminalPanel.tsx`
- Test: `web/loopforge-ade/frontend/src/features/console/__tests__/`
- Test: `web/loopforge-ade/frontend/src/features/terminal/__tests__/`

**Interfaces:**
- Produces: Estilização dark monocromática de console/terminal com cursor neon e scrollbar fina.

- [ ] **Step 1: Aplicar estilo monocromático e cursor neon nos painéis de log e terminal**
- [ ] **Step 2: Rodar testes de console e terminal**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run src/features/console/__tests__/ src/features/terminal/__tests__/`
- [ ] **Step 3: Commit**
  `git add frontend/src/features/console/ frontend/src/features/terminal/ && git commit -m "feat(ui): console e terminal com acabamento glass dark e cursor neon"`

---

### Task 6: Verificação Completa, Build e Sincronização de Bundle

**Files:**
- Sync: `agentes/LoopForge/src/lf/ade/static/dist/`

- [ ] **Step 1: Rodar suíte completa de testes no frontend**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run && npm run build`
- [ ] **Step 2: Sincronizar bundle SPA para o engine**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && python3 scripts/sync_dist.py /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend/dist`
- [ ] **Step 3: Rodar testes de SPA mount no engine**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_spa_mount.py -q`
- [ ] **Step 4: Commit e Push nos dois repositórios**
