# Split Paralelo no DAG — Implementation Plan (Spec S4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o nó único `parallel_audit` no canvas por um sub-grafo visual: **split** (badge "2× parallel") → **2 filhos empilhados** (appsec, devops) → **merge**, com aresta de retry tracejada com curva bezier custom (aprendizado do mockup 5-hybrid).

**Architecture:** Mudança de REPRESENTAÇÃO apenas (contrato com engine inalterado — engine continua executando `parallel_audit` como 1 nó). `dagModel.ts` (puro) expande `parallel_audit` em 4 nós de exibição (split/appsec/devops/merge) cujo status é DERIVADO do status do pai (`canvasStore.nodeStatus['parallel_audit']`). Novos componentes `SplitNode`/`MergeNode`; `AgentNode` reusado nos filhos com mapeamento de clique para o inspector do pai. Geometria por modo: graph = mockup (filhos empilhados), kanban = linear (colunas sequenciais).

**Tech Stack:** React 19, Tailwind v4 (tokens), React Flow (@xyflow/react), Zustand, vitest. Verificação: `npm test` + `npm run build` em `frontend/`.

**Spec:** `docs/superpowers/specs/2026-08-14-pipeline-studio-design.md` §S4. Mockup: `/tmp/opencode/layout-proposals/5-hybrid.html` (item 7 — referência visual, não pixel-perfect).

## Global Constraints

- Baseline: 370 testes pass + build ok ANTES de qualquer mudança (rodar e confirmar).
- NÃO quebrar: contratos de WS (ws.ts:129 nodeNameMap NÃO ganha appsec/devops — seguem rejeitados como eventos de execução; ws.test.ts:51-54 intocado), TimelineBar (semântica de ghostToStep = índice de EXECUÇÃO), RunInspector (rows de custo por NÓ DE EXECUÇÃO), InspectDrawer (continua keyed em `parallel_audit`), canvasStore (sem campos novos).
- Zero dependências novas; texto EN; sem emoji (badge usa texto+glifo CSS); tokens do design system, sem hex.
- `dagModel.ts` permanece PURO (sem imports de React/xyflow runtime além de tipos) — geometria testável.
- Cada task termina com testes verdes + commit. Commits `feat(ade): …`.

---
---

### Task 1: dagModel — sub-grafo split (tipos display + geometria + arestas)

**Files:**
- Modify: `frontend/src/shared/lib/types.ts:31-40` — `NodeType` ganha 4 tipos DISPLAY: `'split' | 'merge' | 'appsec' | 'devops'` (comentário: display-only, derivados de parallel_audit)
- Modify: `frontend/src/features/dag/dagModel.ts`
- Modify: `frontend/src/features/dag/__tests__/dagModel.test.ts`

**Interfaces:**
- Consumes: `PIPELINE_ORDER` (vira ordem de EXECUÇÃO, mantém nome — consumidores existentes), `GRAPH_POS`, `RETRY_NODE`, `DagStatuses`, ghostToStep.
- Produces:
  - `DISPLAY_ORDER: NodeType[]` — pipelineOrderWithRetry() com `parallel_audit` substituído por `['split','appsec','devops','merge']` (quando retry visível: qa→retry→split→appsec→devops→merge).
  - `DISPLAY_PARENT: Record<'appsec'|'devops'|'split'|'merge', NodeType>` = `{ split:'parallel_audit', appsec:'parallel_audit', devops:'parallel_audit', merge:'parallel_audit' }` (ou fn `displayParentOf(node)`).
  - `buildNodes(statuses, mode, ghostToStep)` — MESMA assinatura; agora itera DISPLAY_ORDER; cada nó display:
    - `data.status/attemptCount` = statuses do PAI (`parallel_audit`) para split/appsec/devops/merge;
    - `data.execIndex: number` NOVO — índice de EXECUÇÃO do pai (parallel_audit) para nós display, ou índice da própria posição para nós normais; `ghosted = execIndex >= ghostToStep` (semântica TimelineBar preservada — sub-grafo inteiro some/ghosta junto com o passo parallel_audit);
    - `data.display: 'audit' | undefined` (flag p/ SplitNode saber que é o bloco paralelo).
  - `GRAPH_POS` ganha: `split: {x:1540,y:120}` (onde parallel_audit estava — REMOVER parallel_audit do GRAPH_POS), `appsec: {x:1760,y:60}`, `devops: {x:1760,y:180}`, `merge: {x:1980,y:120}`. Kanban: `{x:i*240, y:120}` (DISPLAY_ORDER linear — appsec e devops em colunas sequenciais).
  - `buildEdges(nodes)` — backbone por DISPLAY_ORDER: `qa→split→appsec`, `qa→split→devops`, `appsec→merge`, `devops→merge` (split tem 2 source handles; merge 2 target handles — ver Task 3), retry inserido antes de split como hoje (`qa→retry→split`); loop `retry→developer` inalterado (detecção geométrica GRAPH_POS.retry). Filhos NÃO têm aresta entre si. `animated`/style quando target running (padrão atual).
  - `DagEdge` ganha campos opcionais tipados: `sourceHandle?: string`, `targetHandle?: string`, `sourcePosition?: 'top'|'bottom'|'left'|'right'`, `targetPosition?: 'top'|'bottom'|'left'|'right'`, `dashed?: boolean`.
  - `buildEdges` emite handles: `split->appsec` com `sourceHandle:'a'`, `split->devops` com `sourceHandle:'b'` (SplitNode: handle a=topo, b=base); `appsec->merge` com `targetHandle:'a'`, `devops->merge` com `targetHandle:'b'` (MergeNode: a=topo, b=base).
  - Retry de FILHO: quando `attemptCount > 0` (statuses do pai), edge extra `devops->split` tracejada com curva custom (Task 5 aplica geometria no FlowCanvas): `{ id:'retry-devops->split', source:'devops', target:'split', dashed: true, animated: true, style: { stroke: 'var(--err)', strokeWidth: 1.5, strokeDasharray: '6 4' }, sourcePosition: 'bottom', targetPosition: 'bottom' }` — só no modo graph (mockup), não no kanban.

- [ ] **Step 1: Testes (falham primeiro)** — dagModel.test.ts: NOVOS casos: (a) `buildNodes({}, 'graph', null)` → ids `[entry,cpo,pm,tech_lead,test_writer,developer,qa,split,appsec,devops,merge]`; (b) posições graph: appsec `{x:1760,y:60}`, devops `{x:1760,y:180}`, merge `{x:1980,y:120}`; (c) ghost: `buildNodes({parallel_audit:{status:'running',attemptCount:0}}, 'graph', 7)` → split/appsec/devops/merge `ghosted:true`, qa `ghosted:false`; (d) status derivado: nodeStatus do pai → filhos `status:'running'`, `attemptCount` do pai propagado; (e) retry visível: attemptCount>0 em qualquer nó → `qa→retry→split` (ids incluem retry entre qa e split); (f) edges: contém `split->appsec` (sourceHandle:'a'), `split->devops` (sourceHandle:'b'), `appsec->merge` (targetHandle:'a'), `devops->merge` (targetHandle:'b'), e NÃO contém edge paralela errada (ex.: `split->merge`); (g) retry filho: attemptCount>0 no pai → edge `devops->split` presente com `dashed:true` e positions bottom (kanban: ausente). ATUALIZAR asserts existentes que usavam parallel_audit no order (dagModel.test.ts:15-16 e demais) → ordem display.
- [ ] **Step 2: Rodar — esperar FAIL** (`npx vitest run src/features/dag/__tests__/dagModel.test.ts`).
- [ ] **Step 3: Implementar** — types.ts (4 tipos novos), dagModel.ts (DISPLAY_ORDER/DISPLAY_PARENT/execIndex/buildNodes/buildEdges/GRAPH_POS; PIPELINE_ORDER fica como ordem de execução; NODE_LABELS ganha split:'Split', merge:'Merge', appsec:'AppSec', devops:'DevOps').
- [ ] **Step 4: Rodar — PASS** (mesmo comando).
- [ ] **Step 5: Suite completa** — `npx vitest run` (full; ajustar só o que quebrar POR CAUSA da nova ordem — ws.test.ts NÃO deve quebrar: appsec/devops seguem rejeitados como execução) + `npx tsc -b --noEmit`.
- [ ] **Step 6: Commit** — `feat(ade): sub-grafo split no dagModel (S4)` — git add SOMENTE frontend/.

---

### Task 2: nodeAccent + tokens (cores appsec/devops)

**Files:**
- Modify: `frontend/src/styles/tokens.css` — §2.x cores: `--node-appsec`, `--node-appsec-text`, `--node-devops`, `--node-devops-text` (mockup: appsec emerald, devops pink — próximos dos pares existentes --node-parallel-audit)
- Modify: `frontend/src/features/dag/nodeAccent.ts` — entries p/ `appsec`/`devops`
- Modify: `frontend/src/features/dag/__tests__/nodeAccent.test.ts`

- [ ] **Step 1: Testes (falham primeiro)** — nodeAccent.test.ts: `nodeAccentVar('appsec')` = `'var(--node-appsec)'`, `nodeAccentTextVar('devops')` = `'var(--node-devops-text)'`.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — tokens.css (2 pares de vars, padrão §2), nodeAccent.ts (4 entries).
- [ ] **Step 4: Rodar — PASS** + `npx vitest run` (full) + tsc.
- [ ] **Step 5: Commit** — `feat(ade): cores appsec/devops nos tokens (S4)` — git add SOMENTE frontend/.

---

### Task 3: SplitNode + MergeNode (componentes React Flow)

**Files:**
- Create: `frontend/src/features/dag/SplitNode.tsx`
- Create: `frontend/src/features/dag/MergeNode.tsx`
- Create: `frontend/src/features/dag/__tests__/SplitNode.test.tsx` + `MergeNode.test.tsx`
- Modify: `frontend/src/features/dag/FlowCanvas.tsx` — nodeTypes ganha `split`/`merge`

**Interfaces:**
- Consumes: `DagNodeData` (data.node/status/ghosted/attemptCount), `nodeAccentVar`, tokens (`--dur-fast`, `--ease-out`), `nodeStatusMeta`.
- Produces:
  - `<SplitNode>` (type 'split'): dimensão compacta (w-32), label "Split", badge **"2× parallel"** (span mono, `bg-[var(--accent)]/15 text-[var(--accent-text)]`, `animate-pulse` quando status running — mockup item 7); ghost → opacity-40 pointer-events-none (padrão AgentNode); 1 handle target Left + **2 source handles** `id="a"` (Position.Right) e `id="b"` (Position.Right) — edges `split->appsec` usam sourceHandle "a", `split->devops` "b" (nós empilhados: handles a=topo b=base); aria-label "Split (parallel audit)".
  - `<MergeNode>` (type 'merge'): compacto (w-32), label "Merge"; **2 target handles** `id="a"` (Left) `id="b"` (Left) + 1 source Right; ghost/status padrão.
  - Ambos: `<button>` nativo (padrão AgentNode), clique → `selectNode('parallel_audit')` (abre InspectDrawer do pai — ver Task 4).

- [ ] **Step 1: Testes (falham primeiro)** — SplitNode.test.tsx: render "Split" + badge "2× parallel"; running → badge tem animate-pulse (assert classe); ghosted → opacity-40 + aria-disabled; clique → `useCanvasStore.getState().selectNode` spy `'parallel_audit'`; 2 source handles com ids a/b (assert via `document.querySelectorAll('.react-flow__handle')` counts). MergeNode.test.tsx: "Merge"; 2 target handles; clique idem.
- [ ] **Step 2: Rodar — FAIL** (módulos não existem).
- [ ] **Step 3: Implementar** — SplitNode.tsx/MergeNode.tsx (copiar padrões de AgentNode: button, ghost, badge tone).
- [ ] **Step 4: Rodar — PASS** + tsc.
- [ ] **Step 5: Commit** — `feat(ade): split/merge nodes no canvas (S4)`.

---

### Task 4: AgentNode filhos (clique → inspector do pai; custo no split)

**Files:**
- Modify: `frontend/src/features/dag/AgentNode.tsx`
- Modify: `frontend/src/features/dag/__tests__/FlowCanvas.test.tsx` (se assertar parallel_audit)

**Interfaces:**
- Consumes: `DISPLAY_PARENT` (Task 1), `NODE_LABELS` (já tem appsec/devops).
- Produces: comportamento — `select()` mapeia: se `data.node ∈ {appsec,devops,split,merge}` → `selectNode('parallel_audit')`; senão atual. **Chip de custo**: `data.cost` continua sendo injetado só p/ nós com entrada em CostResponse.nodes (appsec/devops NÃO têm entrada própria — FlowCanvas só injeta o que o backend retorna); SEM mudança de código no AgentNode p/ custo — verificar que split recebe o cost do pai? NÃO: CostResponse.nodes tem entrada 'parallel_audit' → normalizeNodeName retorna 'parallel_audit' → nenhum nó display casa (split≠parallel_audit) → ninguém mostra custo do bloco. DECISÃO: FlowCanvas (Task 5) injeta o custo de `parallel_audit` também no nó `split` (mapa extra).

- [ ] **Step 1: Testes (falham primeiro)** — FlowCanvas.test.tsx (ou novo AgentNode child test): montar canvas com nodeStatus `{parallel_audit:{status:'running',attemptCount:0}}` → clique no nó appsec (getByLabelText 'AppSec (Running)') → `selectNode` chamado com `'parallel_audit'`; clique no split idem.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — AgentNode.tsx select() com DISPLAY_PARENT map.
- [ ] **Step 4: Rodar — PASS** + full suite + tsc.
- [ ] **Step 5: Commit** — `feat(ade): clique de filhos audit abre inspector do pai (S4)`.

---

### Task 5: FlowCanvas — edges com curva custom (retry filho) + cost no split

**Files:**
- Modify: `frontend/src/features/dag/FlowCanvas.tsx`
- Modify: `frontend/src/features/dag/__tests__/FlowCanvas.test.tsx`

**Interfaces:**
- Consumes: `buildEdges` (Task 1), `costByNode` map existente.
- Produces:
  - Aresta `devops->split` (retry filho, dashed) recebe no FlowCanvas: `sourceHandle`/`targetHandle` não aplicáveis (usa positions bottom), `markerEnd` ArrowClosed `var(--err)`; **curva bezier com positions**: React Flow bezier com `sourcePosition:'bottom'`/`targetPosition:'bottom'` na EDGE (suportado via props da edge) → curva vertical que termina FORA do nó split (mockup: arrowhead legível, não escondida dentro do nó).
  - Cost: no efeito que monta costByNode, adicionar `costByNode.set('split', costByNode.get('parallel_audit'))` (quando existir) → SplitNode renderiza chip de custo do bloco (AgentNode já renderiza data.cost; SplitNode DEVE renderizar o mesmo chip — replicar o bloco do chip do AgentNode em SplitNode nesta task).
  - Kanban: retry filho ausente (buildEdges já não emite); nada a fazer.

- [ ] **Step 1: Testes (falham primeiro)** — FlowCanvas.test.tsx: (a) nodeStatus `{parallel_audit:{status:'running',attemptCount:2}}` modo graph → edge `devops->split` presente com `sourcePosition:'bottom'`, `targetPosition:'bottom'`, `animated:true`, `style.stroke 'var(--err)'` e strokeDasharray; (b) cost mock com node 'parallel_audit' → nó split renderiza chip `formatUsd` (getByText '$0.42' dentro do nó split).
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — FlowCanvas.tsx (mapeamento cost→split + spread das props de edge; agentNodeTypes ganha split/merge — da Task 3); SplitNode.tsx ganha chip de custo (mesmo markup do AgentNode:95-98, testid `cost-chip-split`).
- [ ] **Step 4: Rodar — PASS** + full suite + tsc + build.
- [ ] **Step 5: Commit** — `feat(ade): curva de retry custom + custo do bloco audit (S4)`.

---

### Task 6: Verificação integrada + consumidores + revisão visual

**Files:**
- Verify: `frontend/src/features/timeline/TimelineBar.tsx` (ghostToStep usa execIndex — sem mudança esperada; conferir), `frontend/src/features/dag/RunInspector.tsx` (rows usam PIPELINE_ORDER execução — sem mudança esperada), `frontend/src/features/dag/InspectDrawer.tsx` (keyed parallel_audit — sem mudança)
- Modify: ajustes apenas se os testes desses arquivos quebrarem (e documentar)

- [ ] **Step 1: Suite completa** — `npx vitest run` full: 370 + novos verdes; TimelineBar/RunInspector/InspectDrawer/ws tests INTOCADOS e PASSANDO (prova da preservação de contrato).
- [ ] **Step 2: Build** — `npx tsc -b --noEmit` + `npm run build` limpos.
- [ ] **Step 3: Revisão visual (designer)** — rodar app (dev server + playwright): modo graph com retry (attemptCount>0 via demo) → screenshot: split badge pulsing, filhos empilhados com cores (appsec emerald/devops pink), seta retry tracejada com arrowhead FORA do split; modo kanban → colunas lineares; cliques: appsec/devops/split/merge → InspectDrawer "Parallel Audit" abre. Corrigir inconsistências visuais se houver.
- [ ] **Step 4: Commit** — `feat(ade): split paralelo visual completo (S4)` (se houver mudanças).

---
---

## Self-review notes

- **Spec coverage:** S4 completo: sub-grafo (T1), cores (T2), componentes (T3), interação (T4), curvas+custo (T5), verificação+visual (T6). "Inspector por filho" = InspectDrawer existente do pai (decidido: filhos mapeiam p/ parallel_audit — sem drawer novo). "Status por filho refletido" = derivado do pai (engine não emite eventos por filho — ws.ts:133 documenta).
- **Não quebra:** contrato WS (appsec/devops continuam rejeitados como execução), TimelineBar ghost (execIndex), RunInspector rows (ordem de execução), canvasStore (zero campos novos), InspectDrawer.
- **Riscos anotados:** edges com positions bottom exigem suporte do React Flow nas props de edge (verificado: edge pode carregar sourcePosition/targetPosition); SplitNode com 2 source handles exige sourceHandle nas edges (split->appsec usa "a", split->devops "b"); kanban mantém linear (paralelismo só no graph — decisão de escopo).
- **Fora deste plano:** S2 (CRUD agentes), S3 (editor pipelines), refactor STATUS_TONE/runStatus.ts (carry-over S2).

---

## Post-review carry-over (p/ S2/S3)

- **STATUS_TONE/statusLabel 3 cópias** (RunTabs, RunInspector, SidebarHost.RunsSummary) → extrair `shared/lib/runStatus.ts` (S2)
- **NodeShell**: layout de nó duplicado 3x (AgentNode/SplitNode/MergeNode ~80% idênticos) — extrair base comum antes de S3 (editor ganha mais tipos de nó)
- **decorateEdges** ficou em FlowCanvas por constraint de pureza do dagModel (MarkerType é enum runtime) — se crescer no S3, módulo próprio `dag/edgeStyle.ts`
- **GRAPH_POS Partial + fallback linear + break defensivo do backbone** = fundação do editor dinâmico (S3) — manter
- **smoke.spec.ts** acopla label com status do demo (`Split (parallel audit, Approved)`) — quebra se demo mudar status default
- **Ring de seleção** aplica aos 4 nós display quando pai selecionado (bloco unitário) — 1 linha se quiser só o split
- **page.evaluate com stores** exige import com `.ts` (Vite duplica store zustand sem extensão)
