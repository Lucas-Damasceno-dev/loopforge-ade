# 01b — Design System da ADE (Agentic Development Environment)

> Escopo: SPA de debugging/governança em tempo real do pipeline de agentes (conjunto
> canônico de nós em `03-contratos-api.md` §7: execução = `cpo → pm → tech_lead →
> test_writer → developer → qa → parallel_audit`; `entry`/`retry` são nós virtuais
> de apresentação). Este documento documenta e estende o ui-kit existente no branch
> `feature/ade-fase2` — nada aqui contradiz o código real; onde o valor proposto não
> existe ainda, está marcado como *(extensão proposta)*. Código-fonte de referência:
> `styles/tokens.css`, `ui/*`, `dag/AgentNode.tsx`, `hitl/HitlDrawer.tsx`,
> `runs/RunTabs.tsx`. **Referência obrigatória das tasks B1–B6 e do QA visual (B6).**

---

## 1. Direção visual

A ADE é uma ferramenta de observabilidade e controle de um processo que já é, por si só, complexo. A UI não compete com essa complexidade: ela a organiza. Estética dark-first, sóbria e densa, no registro Vercel/Linear — zinc como base neutra, índigo como único acento global, e cor semântica reservada estritamente para estado (ok/err/warn/info) e identidade de cada agente (um acento por tipo de nó). Sem glassmorphism, sem gradientes decorativos, sem sombras dramáticas: a hierarquia vem de superfícies em camadas (zinc-950/900/800), bordas de 1px e tipografia compacta. Todo enfeite que não carrega informação é removido.

**Princípios**

1. **Sóbrio, denso, sem enfeite — a complexidade é do problema, não da UI.** Superfícies neutras, hierarquia por contraste de tom, nunca por decoração.
2. **Cor = significado.** Acento índigo marca apenas o estado ativo do sistema; acentos por nó identificam agente; semânticas (ok/warn/err/info) sinalizam saúde. Nada de cor puramente decorativa.
3. **Complexidade explícita, nunca escondida.** Drawers não-modais (o canvas continua visível), abas, filtros e contadores de retry ficam à vista. O usuário nunca perde o contexto do pipeline.
4. **Densidade controlada.** Escala de 4px, texto-base 14px, linhas de ~28–32px. Informação por pixel alta, sem apertar a leitura.
5. **Movimento discreto e funcional.** Transições ≤ 300ms, easing único, apenas para comunicar mudança de estado (nó, drawer, reconexão, ghosting). Nada de animação contínua/decorativa.
6. **Acessibilidade é spec, não ajuste.** Contraste AA no mínimo, operação completa por teclado (tabs do DAG, roving tabindex nas abas de runs, Esc para drawers), e `prefers-reduced-motion` zerando transições.

---

## 2. Design tokens

Valores em `styles/tokens.css` são fonte de verdade. Onde o token não existe hoje, o valor proposto vem marcado como *(extensão proposta)*.

### 2.1 Paleta dark (hex)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#09090b` (zinc-950) | Fundo do app |
| `--bg-elev` | `#18181b` (zinc-900) | Superfície elevada: nós, abas ativas, drawers, inputs |
| `--bg-elev-2` | `#27272a` (zinc-800) | Hover de superfície, chips |
| `--border` | `#3f3f46` (zinc-700) | Borda padrão (1px) |
| `--text` | `#fafafa` (zinc-50) | Texto primário |
| `--text-dim` | `#a1a1aa` (zinc-400) | Texto secundário, rótulos, timestamps |
| `--accent` | `#4f46e5` (indigo-600) | Acento global: foco, seleção, nó ativo, botão primário |
| `--ok` | `#16a34a` (green-600) | Sucesso / aprovado |
| `--warn` | `#d97706` (amber-600) | Aviso / pausado / limite |
| `--err` | `#dc2626` (red-600) | Erro / rejeitado / retry |
| `--info` *(extensão proposta)* | `#3b82f6` (blue-500) | Nível de log `info`, estados informativos que não são "ativos" e preenchimento da cost bar <80% (§3.4) (não confundir com `--accent`) |

**Receita de tons translúcidos** (badges, banners, chips): sobre qualquer superfície, `bg: <cor>/15`, `border: <cor>/30`, `text: <variante -text>` — padrão já usado em `Badge.tsx` e `Banner.tsx`, com uma correção: o texto **nunca** usa o token base de cor saturada (sobre o próprio tint em 12px, `--ok` dá 5.2:1, `--err` 3.8:1 e `--accent` 2.9:1 — falham AA). Pares medidos (texto 12px sobre tint/15 sobre `--bg-elev`): `--ok-text` `#22c55e` → 6.4:1 · `--err-text` `#f87171` → 5.8:1 · `--accent-text` `#818cf8` → 5.4:1 · `--warn` `#d97706` → 4.6:1 · `--text-dim` (neutral, sobre `--bg-elev`) → 6.9:1 — todos AA.

### 2.2 Acentos por tipo de nó

> Nota de reconciliação (M-19, **implementado**): o id do nó de implementação é
> `developer` (backend) e o token é `--node-developer`; `entry` e `retry` são nós
> virtuais de apresentação. A SPA não usa mais o id `dev` nem o token `--node-dev`.

| Nó | Token (base) | Valor | Base sobre `--bg-elev` (border/chip) | Rótulo do nó (texto) |
|---|---|---|---|---|
| entry (virtual) | `--node-entry` | `#64748b` (slate-500) | 3.7:1 — decorativo¹ | `--node-entry-text` `#94a3b8` (slate-400) — 6.9:1 **(obrigatório)** |
| cpo | `--node-cpo` | `#4f46e5` (indigo-600) | 2.8:1 — decorativo¹ | `--accent-text` `#818cf8` (indigo-400) — 5.9:1 **(obrigatório)** |
| pm | `--node-pm` | `#0ea5e9` (sky-500) | 6.4:1 | base — 6.4:1 (AA) |
| tech_lead | `--node-tech-lead` | `#8b5cf6` (violet-500) | 4.2:1 — decorativo¹ | `--node-tech-lead-text` `#a78bfa` (violet-400) — 6.5:1 **(obrigatório)** |
| test_writer | `--node-test-writer` | `#ec4899` (pink-500) | 5.0:1 | base — 5.0:1 (AA) |
| dev → developer (M-19) | `--node-dev` → `--node-developer` | `#10b981` (emerald-500) | 7.0:1 | base — 7.0:1 (AA) |
| qa | `--node-qa` | `#f59e0b` (amber-500) | 8.2:1 | base — 8.2:1 (AA) |
| retry (virtual) | `--node-retry` | `#f43f5e` (rose-500) | 4.8:1 | base — 4.8:1 (AA) |
| parallel_audit | `--node-parallel-audit` | `#14b8a6` (teal-500) | 7.1:1 | base — 7.1:1 (AA) |

O acento do nó aparece em três lugares: borda superior (`border-top: 3px`), cor do rótulo e, se aplicável, no chip da cost bar. **Regra de rótulo**: o texto do nó usa a variante `-text` da família quando a base fica abaixo de 4.5:1 sobre `--bg-elev` (entry, cpo, tech_lead — obrigatório em qualquer tamanho); nos demais, o token base (AA). Border e chip usam sempre o token base. ¹ O border-top de entry (3.7:1) e cpo (2.8:1) fica abaixo do limiar 3:1 de UI, mas é isento pelo WCAG 1.4.11: a identificação do nó é redundante (rótulo AA + badge de estado) — o acento é decoração, não o único canal. Kebab-case no CSS (`--node-tech-lead`) mapeia o `NodeType` snake_case — ver `nodeAccentVar()` em `AgentNode.tsx`.

### 2.3 Contraste AA (pares texto/fundo)

Razões medidas sobre o fundo real (WCAG 2.1, 1.4.3): texto normal ≥ 4.5:1; UI e texto grande ≥ 3:1.

| Par | Razão | Veredito |
|---|---|---|
| `--text` sobre `--bg` | 19.1:1 | AA (AAA) |
| `--text-dim` sobre `--bg` | 7.8:1 | AA |
| `--text-dim` sobre `--bg-elev` | 6.9:1 | AA |
| `--text-dim` sobre `--bg-elev-2` | 5.8:1 | AA |
| `--ok` sobre `--bg` | 6.0:1 | AA |
| `--warn` sobre `--bg` | 6.2:1 | AA |
| `--err` sobre `--bg` | 4.1:1 | UI e texto grande apenas; texto normal → `--err-text` `#f87171` (obrigatório) |
| `--accent` sobre `--bg` | 3.2:1 | UI e texto grande apenas; texto normal → `--accent-text` `#818cf8` (obrigatório) |
| `--accent-text` sobre `--bg-elev` | 5.9:1 | AA (rótulos de nó, texto de acento) |
| `--err-text` sobre `--bg` / `--bg-elev` | 7.2:1 / 6.4:1 | AA |
| `white` sobre `--accent` (botão primary) | 6.3:1 | AA |
| `white` sobre `--err` (botão danger) | 4.8:1 | AA |
| Badges (texto sobre tint/15) | — | Receita §2.1 — todos os pares AA com variantes `-text` |

Regra de decisão (WCAG 2.1, 1.4.3): o limiar de 3:1 vale apenas para UI (componentes e gráficos) e texto grande — definido como ≥ 24px regular ou ≥ 18.66px bold (14pt). Qualquer texto abaixo disso (incluindo 14px semibold e 13px) exige 4.5:1 sobre o fundo real; quando o token base fica abaixo de 4.5:1, o texto usa **obrigatoriamente** a variante `-text` da família — nunca o token base.

### 2.4 Tipografia *(famílias propostas — nada definido hoje)*

| Token | Valor |
|---|---|
| `--font-sans` | `"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif` |
| `--font-mono` | `"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace` |

Mono é reservado para código e dados: console, custos (cost bar), JSON do HITL, IDs de run/curtos, contagem de tentativas. Sans para todo o resto.

Escala (px) e usos:

| Tamanho | Peso | Uso |
|---|---|---|
| 10px | 500/600, uppercase + `tracking-wide` (0.025em) | Micro-rótulos uppercase: cabeçalhos de seção e "queued"; o status do nó usa 10px 500 em **lowercase** (sem uppercase) |
| 12px | 400/500 | Badges, abas de runs, linhas do console, decisões, timestamps |
| 13px | 500 | Texto secundário em densidade |
| 14px | 400/600 | Base (14px): corpo, botões `md`, rótulo do nó (semibold) |
| 16px | 600 | Título de empty state, ênfases |
| 20px | 600 | Título de drawer inspect / modal *(extensão proposta)* |
| 24px | 700 | Título do modal de budget *(extensão proposta)* |

Pesos em uso: 400 (corpo), 500 (botões, badges), 600 (títulos, rótulos, aba ativa), 700 (chip `×N`).

### 2.5 Espaçamento — escala de 4px

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`. Convenções: padding padrão de card/input 8–12px; padding de painel/drawer 16px; seções internas 12–20px; colunas de layout 24–32px; folgas de seção 40–48px. Não existem espaçamentos ímpares (sem 3px, 7px, 10px).

### 2.6 Raio

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 4px | Chips, inputs de texto, botão close |
| `--radius-md` | 6px | Botões, cards internos, textarea, toasts |
| `--radius-lg` | 12px | Nó do DAG (card), modal, drawer (só se flutuante) |
| `--radius-full` | 999px | Badges (pílula) |

### 2.7 Elevação — sombras sóbrias *(extensão proposta)*

Sombras com tinta única (`rgb(0 0 0)`, sem coloração de cor de acento):

| Token | Valor | Uso |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgb(0 0 0 / 0.35)` | Divisão sutil (barras, chips) |
| `--shadow-node` | `0 4px 6px -1px rgb(0 0 0 / 0.45)` | Nó do DAG (substitui `shadow-md` do Tailwind) |
| `--shadow-drawer` | `-16px 0 32px rgb(0 0 0 / 0.40)` | Drawer direito (luz vinda do canvas) |
| `--shadow-modal` | `0 24px 48px -12px rgb(0 0 0 / 0.60)` | Único modal (budget) |

Escala de camadas (z-index): canvas 0 · overlay de drawer 40 · drawer 50 · banner 60 · modal 70 · toast 80 *(extensão proposta a partir de 60 — hoje banner e drawer dividem o 50)*. Overlays: `--overlay` = `rgb(0 0 0 / 0.40)` (drawer não-modal — §3.2/§3.8, rail <1280 em §6.2) e `--overlay-strong` = `rgb(0 0 0 / 0.60)` (modais bloqueantes — §3.6/§3.13) *(ambos extensão proposta — hoje hardcoded como `black/40` e `black/60`)*. Foco de teclado sempre com `outline`/`ring` 2px `--accent` (`focus-visible`).

### 2.8 Scrollbar *(extensão proposta)*

Aplicar em todos os painéis com overflow (console §3.7, drawers §3.2/§3.3, abas de runs §3.10, chips da cost bar §3.4, decision history §3.3):

| Propriedade | Valor |
|---|---|
| Largura (WebKit) | 10px (thumb 8px + 2px de respiro) |
| Thumb | `--border` (`#3f3f46`), `radius-full` |
| Thumb hover | `#52525b` (zinc-600) |
| Track | transparente (fundo do painel) |
| Firefox | `scrollbar-width: thin; scrollbar-color: var(--border) transparent` |
| Gutter | `scrollbar-gutter: stable` — evita layout shift ao o scroll aparecer/sumir |

Sem scrollbar nativa clara em superfície dark: track transparente + thumb em tom de borda mantêm a hierarquia de superfícies sem introduzir cinza-claro de sistema.

---

## 3. Inventário de componentes

### 3.1 Nó do DAG (`AgentNode.tsx`)

Card de 176px (`w-44`), `bg-elev`, `border` 1px + `border-top: 3px` na cor do acento do nó, `radius-lg`, `shadow-node`.

| Estado | Badge (tone) | Borda/card | Opacidade | Detalhe |
|---|---|---|---|---|
| `pending` | neutral | borda zinc-700 | 100% | Estado default (0 tentativas) |
| `running` | accent | borda zinc-700 | 100% | Rótulo com acento do nó |
| `approved` | ok | borda zinc-700 | 100% | |
| `rejected` (erro) | err | borda zinc-700 | 100% | Nó abortado/falho |
| `paused` | warn | borda zinc-700 | 100% | Gate HITL — drawer abre |
| ghost | — | — | 40% | Nós do passo `ghostToStep` em diante (timeline) |

- **Chip de retry**: quando `attemptCount > 1`, chip `×N` (`bg err/15`, texto `--err-text` bold 12px, raio 4px, `title="retry ×N"`).
- **Seleção**: `ring-2` índigo. **Foco teclado**: `focus-visible:ring-2` índigo; Enter/Espaço selecionam (role=button, `aria-label="<Label> (<Status>)"`).
- **Handles** (xyflow): círculos 12px, `--border`; hover de aresta não muda o handle.
- **Ghost**: *(extensão proposta)* além da opacidade, `pointer-events-none` e `aria-disabled` — nós fantasma não devem abrir o inspect drawer.

### 3.2 Inspect drawer

Drawer base (ver 3.8 kit): largura fixa **380px**, não-modal (`aria-modal="false"`, overlay `--overlay` clicável, Esc fecha). Header: rótulo do nó na variante `-text` do acento (§2.2) + badge de status + botão close. Corpo em seções rotuladas (uppercase 10px): Status e tentativas; Timing (início/fim, mono); Dependências (arestas entrada/saída); Ações contextuais (Approve/Retry/Abort quando `paused`). *(Conteúdo detalhado é extensão; o drawer em si já existe.)*

### 3.3 HITL drawer (`HitlDrawer.tsx`)

Mesmo drawer, aberto automaticamente quando a run ativa tem nó `paused` (gate = primeiro paused na ordem do pipeline). Regras visuais:

- Header: rótulo do nó em `--accent-text` (texto nunca usa o token base — §2.3) + `Badge warn "Waiting for decision"`.
- **Timeout**: quando o wsBridge loga `HITL decision expired`, um `Banner warn` fixo no topo mostra `Decision expired (<seconds>s) — run paused`.
- Grade de ações 2 colunas: `Approve` (primary), `Retry` (ghost), `Abort` (ghost — abre a confirmação destrutiva, §3.13), `Adjust State` (subtle) — desabilitados enquanto `pendingAction`.
- Erro inline: caixa `role="alert"`, `border err/30`, `bg err/15`, texto `--err-text`, raio 6px.
- **Adjust State**: painel colapsável com textarea mono 12px (`h-28`), `Advanced JSON` toggle, aviso amber do gap V1 ("state edits are not applied yet") e botão `Apply`.
- **Decision history**: lista mono 12px — `user · timestamp · action on gate_node`; vazio → "No decisions yet".

### 3.4 Cost bar *(extensão proposta)*

Barra horizontal no topo do painel direito (ou acima do console em telas estreitas):

- **Barra de budget**: trilho 6px (`bg-elev-2`), preenchimento com cor por limite — `<80%` `--info` (estado informativo, não o acento global — preserva §1.2 "cor = significado"); `80–99%` `--warn`; `≥100%` `--err`. Marcador de 80% (linha 1px `--border`).
- Rótulos: "Budget" + valor usado/total em mono 12px; usado > total em `--err-text`.
- **Chips por nó**: dot 8px na cor do acento do nó + valor em mono 12px `--text-dim`, agrupados horizontalmente com scroll.

### 3.5 Timeline slider (modo inspeção) *(extensão proposta)*

Barra abaixo do canvas (ou no console header), ativa no modo inspeção:

- `input[type=range]` com trilho 4px `--bg-elev-2`, thumb visual 12px `--accent` sobre hit area de **24×24px** (alvo tátil mínimo, §6.4), foco `ring-2` na hit area. Contraste: o par thumb/trilho (`--accent` sobre `--bg-elev-2`) fica em 2.8:1 — abaixo de 3:1, aceito porque o passo é redundante com o rótulo "Step X/Y" e o banner de inspeção; alternativa estrita: fill `--accent-text` (5.0:1).
- Rótulo mono: `Step X/Y`. Cada movimento atualiza `ghostToStep` → nós do passo em diante ficam `opacity-40` (transição 200ms, ver seção 4).
- Banner informativo fixo no topo (tone `info`/accent): `Inspection — step X/Y`.
- Botões de navegação (ghost, `sm`): passo anterior/próximo; Enter/Espaço + setas operam o slider.

### 3.6 Modal de budget — modal bloqueante de configuração *(extensão proposta)*

`role="dialog" aria-modal="true"`, overlay `--overlay-strong`, card central `max-w-[480px]`, `bg-elev`, `border`, `radius-lg`, `shadow-modal`, foco travado no modal (focus trap) e Esc fecha. Header: título 24px + close. Corpo: campo numérico (Input mono 14px, §3.12, `inputmode="decimal"`, label "Budget (USD)"), validação inline `role="alert"` em `--err-text` para valor inválido. Footer: `Cancel` (ghost) / `Save` (primary). Todo o resto do app permanece atrás do overlay sem interação. O único outro modal do sistema é a confirmação destrutiva de Abort (§3.13), que compartilha esta base.

### 3.7 Console

- **Header**: rótulo "Console" + filtros por nível — chips toggle (`info` / `warn` / `error`), estado ativo com `bg-elev-2` + texto `--text`, acessíveis por teclado (`aria-pressed`); botão "Clear" (ghost `sm`).
- **Linhas**: mono 12px, `timestamp` dim + mensagem; cor por nível: `info` → `--text-dim` (ou `--info` em mensagens estruturadas), `warn` → `--warn`, `error` → `--err-text` (12px normal não alcança 4.5:1 com `--err`). Linhas de warn/error podem ter borda esquerda 2px na cor do nível.
- Comportamento: auto-scroll para o fim; pausa de scroll quando o usuário rola para cima *(extensão proposta)*. Altura: `min 200px`, `max 40vh`, redimensionável via SplitPane.

### 3.8 Kit base existente

| Componente | Spec |
|---|---|
| `Button` | Variants: `primary` (bg accent, texto branco, hover opacity-90), `ghost` (transparente, `border`, hover `bg-elev`), `danger` (bg err, branco), `subtle` (`bg-elev`, texto dim, hover texto full). Sizes: `sm` 12px/8×4px, `md` 14px/12×6px. Foco `outline-2` accent, disabled opacity-50, raio 6px, peso 500. |
| `Badge` | Pílula 12px, `px-2 py-0.5`, peso 500. Tons: `neutral` (bg-elev/border), `ok`, `warn`, `err`, `accent` — sempre tint `/15` + border `/30`; texto pela variante `-text` da família em `ok`/`err`/`accent`, base em `warn`/`neutral` (Receita §2.1). |
| `Drawer` | Não-modal, 380px à direita, `bg-elev`, `border-l`, `shadow-drawer`, overlay `--overlay`, Esc fecha, `aria-modal="false"`, body com scroll (`overflow-y-auto`, scrollbar §2.8). |
| `Banner` | Fixo topo full-width `z-60` (acima do drawer — escala §2.7), 14px, `px-4 py-2`. Tons: `warn`/`err`/`info`; `err` → `role="alert"`, demais → `role="status"`. |
| `EmptyState` | Centralizado, `py-12`, título 16px semibold, descrição 14px dim, ação opcional (Button `sm`). |
| `SplitPane` | Horizontal/vertical; filho A com `flexBasis`; divider 4px (`w-1`/`h-1`) `--border`, hover `--accent`, `role="separator"`; arraste via pointer events. *(Extensão proposta: suporte a setas do teclado no divider — hoje só ponteiro.)* |

### 3.9 Toasts *(extensão proposta)*

Pilha fixa topo-direita (z-80 — acima de modais e banner, escala §2.7), cards 320px, `bg-elev`, `border`, raio 6px, `shadow-xs`, borda esquerda 2px por nível. Fecham por X ou auto-dismiss em **4000ms** (toasts de erro não auto-dismissam). `role="status"` (info/warn) ou `role="alert"` (err). Sem ícones — o tom vem da cor da borda e do texto.

### 3.10 Tabs de runs (`RunTabs.tsx`)

`role=tablist` com `aria-label="Runs"`, scroll horizontal, `border-b`, `px-2 py-1.5`. Aba ativa: `bg-elev`, `border` (com `border-b-0`), texto full; inativa: transparente, `text-dim`, hover texto full. Conteúdo: ID curto (`demo-XXXX` ou `#<6 chars>`), `Badge` com status (pending→neutral, running→accent, completed→ok, failed→err), e indicador de fila "queued" (uppercase 10px dim) quando a run está na `queue`. Close `×` separado (hover `err`). Navegação: roving tabindex (`aria-selected`), setas ←/→ movem e focam a próxima aba.

### 3.11 Topbar — header do app *(extensão proposta)*

Barra fixa no topo, altura **44px**, `bg --bg`, `border-b` 1px `--border`, padding horizontal 16px.

| Região (esq → dir) | Conteúdo |
|---|---|
| Identidade | Título do workspace 14px/600 + id curto da run ativa em mono 12px `--text-dim` |
| Conexão WS | Indicador **persistente** (dot 8px + label 12px): `Connected` (dot ok) / `Reconnecting…` (dot warn) / `Offline` (dot err) — distinto do banner temporário de reconexão (§3.8); `aria-label="Connection status: <estado>"` |
| Spacer | — |
| Ações | Botão de menu global (ghost `sm`, §3.8) — em <1280px abre o rail como drawer (§6.2) |

- **F11 / fullscreen** (§6.1): a topbar é ocultada junto com rail, inspector e abas; o indicador "Press F11 to exit fullscreen" permanece no canto do canvas.
- Acessibilidade: itens interativos com `focus-visible` ring 2px `--accent`; o dot de conexão nunca é o único canal — o label textual está sempre presente.

### 3.12 Form controls *(extensão proposta)*

| Controle | Spec |
|---|---|
| `Input` (texto/número) | Altura 32px, padding 0 8px, 14px (`mono` quando o dado é mono: ids, valores), `bg --bg-elev`, `border` 1px `--border`, `radius-sm` (4px, §2.6), placeholder `--text-dim` (6.9:1 sobre `--bg-elev`, AA). Estados: hover → `border --text-dim/40`; focus → `ring-2 --accent` + `border --accent`; disabled → `opacity-50` + `cursor-not-allowed`; error → `border --err` + `ring err/30`, com mensagem abaixo 12px `--err-text` `role="alert"` |
| `Textarea` | Base do Input, `radius-md` (6px), padding 8px, resize vertical, altura mínima por uso (ex.: `h-28` no Adjust State, §3.3) |
| `Toggle` | Trilho 28×16px, `radius-full`, off `bg-elev-2` / on `--accent`; thumb 12×12 branco; hit area 24×24 (padding — §6.4); foco `ring-2`; disabled `opacity-50`; `role="switch"` + `aria-checked` |
| Campo numérico do modal (§3.6) | `Input` mono 14px com `inputmode="decimal"` |

Todos: `focus-visible` sempre com ring 2px `--accent`; placeholder nunca substitui label (labels visíveis em 12px).

### 3.13 Modal de confirmação — Abort *(extensão proposta)*

Abre a partir do drawer HITL (§3.3, ação `Abort`) e do botão abortar de outras superfícies. Compartilha a base do modal §3.6: `role="dialog" aria-modal="true"`, overlay `--overlay-strong`, card central `max-w-[400px]`, `bg-elev`, `border`, `radius-lg`, `shadow-modal`, focus trap, Esc fecha.

- Título 20px/600: `Abort run?` · corpo 14px: `This stops the run and rejects pending decisions. You can retry it later.`
- Footer: `Cancel` (ghost) / `Abort` (**danger** — `bg --err`, texto branco, §3.8).
- **Distinção dos dois modais**: o de budget (§3.6) é bloqueante de configuração; este é de confirmação **destrutiva** — nunca dispara sem ação explícita do usuário e o botão confirmatório é sempre `danger`.

---

## 4. Motion

Sóbrio e curto — **nada acima de 300ms**. Easing único: `cubic-bezier(0.16, 1, 0.3, 1)` (saída suave; usado em Tailwind como `ease-out` customizado). Opacidades e cores podem usar `ease-out` linear puro.

| Elemento | Propriedade | Duração | Easing |
|---|---|---|---|
| Nó: troca de estado (badge/borda) | cor, fundo | 150ms | ease-out |
| Nó: seleção (`ring`) | cor | 100ms | ease-out |
| Ghosting de nó (timeline) | opacidade | 200ms | ease-out |
| Drawer: painel | `translateX(24px→0)` | 200ms | `cubic-bezier(0.16,1,0.3,1)` |
| Drawer: overlay | opacidade | 150ms | ease-out |
| Banner de reconexão | `translateY(-100%→0)` | 200ms | `cubic-bezier(0.16,1,0.3,1)` |
| Modal de budget | opacidade + `scale(0.98→1)` | 200ms | ease-out |
| Toast: entrada/saída | `translateY(8px→0)` + opacidade | 150ms | ease-out |
| Hover de botão/badge | cor | 100ms | ease-out |

**`prefers-reduced-motion: reduce`** — zerar todas as durações (`transition-duration: 0ms`; animações de ghosting aplicam o estado final imediatamente). Nenhuma animação é essencial para compreender o estado: antes de animar, o estado final já é correto.

---

## 5. Microcopy

**Tom**: direto, técnico, factual. Sem exclamações, sem emojis, sem humor. Frases curtas; o estado do sistema é descrito, não dramatizado. Botões usam verbo no imperativo ("Approve", "Retry", "Apply"). Erros informam o que aconteceu e, quando possível, o que fazer.

| Contexto | Mensagem (EN) | Tone / componente |
|---|---|---|
| Conexão WS perdida (banner) | `Server disconnected — reconnecting…` | Banner `warn` |
| Budget em 80% (limiar) | `Budget at 80% — approaching the limit` | Cost bar `warn` |
| Budget estourado (100%) | `Budget exhausted — run paused` | Banner/Toast `err` |
| HITL expirou | `Decision expired (<seconds>s) — run paused` | Banner `warn` (já no código) |
| Run entrou na fila | `Run queued — waiting for an available slot` | Toast `info` |
| Fork do pipeline criado | `Fork created — <name> diverges after <node>` | Toast `info` |
| DAG sem run ativa (empty state) | `No active run` / `Start a run to see the pipeline in action` | EmptyState |
| Console vazio | `No console output yet` | EmptyState |
| Histórico de decisões vazio | `No decisions yet` | texto dim |
| JSON inválido (Adjust State) | `Invalid JSON` | erro inline `role="alert"` |
| Gap V1 (Adjust State) | `V1 gap: state edits are not applied yet — JSON is sent as feedback_message.` | aviso amber |
| Falha genérica de decisão | `Decision failed` | erro inline `role="alert"` |
| API 401 | `Session expired — re-authenticate to continue` | Banner/Toast `err` |
| API 503 | `Service unavailable — retrying in a few seconds` | Banner `warn` + reconexão |
| Inspeção de timeline | `Inspection — step X/Y` | Banner `info` |
| Fechar elementos | `Close`, `Close <id>` | aria-label, nunca símbolo sozinho |
| Conexão WS (topbar, persistente) | `Connected` / `Reconnecting…` / `Offline` | indicador dot + label, §3.11 |
| Confirmação de Abort | `Abort run?` / `This stops the run and rejects pending decisions. You can retry it later.` | modal danger, §3.13 |

**Regra de pontuação**: em-dash (—) separa o estado da consequência ("estado — consequência"); reticências (…) apenas em estados contínuos (`Reconnecting…`, `reconnecting…`); placeholders entre `< >` em lowercase, com a unidade fora (`<seconds>s`, `<name>`, `<node>`); sem ponto final em banners/toasts (a mensagem do V1 gap é a exceção documentada, por ser aviso técnico inline).

---

## 6. Layout

### 6.1 Grade de 3 colunas (viewport ≥ 1280px)

```
┌──────────┬──────────────────────────┬──────────┐
│ Rail     │ Canvas (DAG)             │ Inspector│
│ 240px    │ flex-1 (min 560px)       │ 320px    │
└──────────┴──────────────────────────┴──────────┘
┌─────────────────────────────────────────────────┐
│ Console (SplitPane vertical, min 200px)         │
└─────────────────────────────────────────────────┘
```

| Coluna | Largura | Min / Max |
|---|---|---|
| Rail esquerdo (runs) *(extensão proposta)* | 240px | 200 / 320px |
| Canvas central (xyflow) | `flex-1` | min 560px (abaixo disso, rail colapsa — ver 6.2) |
| Painel direito (inspector + cost bar) | 320px | 280 / 400px |
| Console | altura | min **200px** / max 40vh (default ~256px) |

- **Densidade**: textos-base 14px, paddings 8–12px, cabeçalhos de seção uppercase 10px; sem margens decorativas.
- **Divider do SplitPane**: 4px, `--border`, hover `--accent`.
- **F11 / fullscreen do canvas**: oculta rail, inspector, abas e a topbar (§3.11) — restam apenas canvas e console (SplitPane mantém redimensionamento). Um indicador discreto no canto do canvas avisa `Press F11 to exit fullscreen` *(extensão proposta)*.

### 6.2 Comportamento < 1280px

1. **Painel direito colapsa**: inspector deixa de ser coluna e vira o drawer de 380px (comportamento que já existe); a **cost bar** migra para uma faixa acima do console.
2. **Rail esquerdo vira drawer/overlay** disparado pelo botão de menu da topbar (§3.11) (z-50, overlay `--overlay`) *(extensão proposta)*.
3. Canvas mantém `min 560px`; abaixo disso, o canvas entra em modo "fit" (zoom de xyflow) em vez de scroll horizontal.

### 6.3 Canvas (xyflow)

- Nó do DAG: 176px de largura, `radius-lg`, acento na borda superior (seção 3.1).
- **Kanban**: colunas lineares — `x = index * 260`, `y = 120 + (index % 2) * 80` (ziguezague de 2 linhas, do `dagModel.ts`).
- **Grafo**: `GRAPH_POS` com fluxo principal em linha única e `retry` abaixo de `developer` (aresta curva `retry→developer`).
- Arestas: cor `--border` 1.5px; seta discreta. *(Extensão proposta: aresta do step ativo em `--accent`.)*
- Fundo do canvas: `--bg` com grade de pontos sutis (`--border` a 20% de opacidade) *(extensão proposta)* — sem padrões decorativos.

### 6.4 Responsividade e foco

- Tudo que é interativo por clique também o é por teclado: nó (Enter/Espaço), abas (setas + roving tabindex), drawer (Esc), slider (setas), filtros de console (`aria-pressed`).
- Ordem de foco: rail → canvas → inspector → console (DOM order); modal de budget trava o foco.
- Alvo mínimo de toque para controles: 24×24px (chips de filtro, close, thumbs).
