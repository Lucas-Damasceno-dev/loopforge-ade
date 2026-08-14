# ADE Shell Visual — Spec do shell híbrido (fase 0)

Fonte de requisitos visuais das tasks 2-7 (rail 48px, sub-sidebar 260px,
inspector 300px, bottom bar ícone-only, budget pill). Direção aprovada no
mockup `5-hybrid` (`.superpowers/sdd/2026-08-14-layout-hybrido`).

**Regras do shell:** usar SEMPRE os tokens de `src/styles/tokens.css` (nunca
hex/px solto de cor/fonte); zero emoji — ícones inline SVG `stroke
currentColor` 24x24 (padrão `TopbarAction`); todo texto de UI em inglês;
dados/ids em `--font-mono`; raio interativo `--radius` 6px.

## 1. Regiões e dimensões

| Região | Dimensão | Token | Observação |
|---|---|---|---|
| Topbar | 44px | `h-11` (existente) | inalterada; recebe trigger `⌘K` central |
| Rail (activity bar) | 48px | `--rail-w` | coluna fixa à esquerda, ícone-only |
| Sub-sidebar | 260px | `--sidebar-w` | abre à direita do rail; uma por vez |
| Run Inspector | 300px | `--inspector-w` | painel direito, colapsável |
| Bottom bar (tabs) | tab 32px | `--tab-h` | tabs ícone-only; corpo redimensionável (SplitPane) |
| Budget pill | auto | — | flutuante sobre canvas, canto inferior esquerdo |
| Header de painel | 36px | `--panel-head-h` | rail sidebar/inspector/bottom bar |

Stacking: regiões no fluxo do layout (sem z-index). Drawers `z-[50]`, modais
`z-[70]` (existente) — pill e overlay do canvas abaixo de ambos.

## 2. Rail 48px

- Botão: `w-full h-12` (48px), ícone 20px (`h-5 w-5`), `stroke-width 2`,
  `text-[var(--text-dim)]`.
- Hover: `bg-[var(--bg-elev)] text-[var(--text)]`, `transition-colors
  duration-[var(--dur-fast)]`.
- Ativo: `text-[var(--accent-text)]` + barra esquerda 2px `bg-[var(--accent)]`
  (pseudo-elemento ou `border-l-2`), fundo `bg-[var(--bg-elev)]`.
- Focus: `focus-visible:ring-2 ring-[var(--accent)]` (padrão global).
- Tooltip à direita (padrão §7).
- Grupo: separador `h-px bg-[var(--border)]` entre grupos lógicos.

## 3. Sub-sidebar 260px

- Superfície `bg-[var(--bg-elev)]`, `border-r border-[var(--border)]`.
- Header padrão §6 (36px): título `text-sm font-semibold text-[var(--text)]` +
  chevron de collapse (`<`/`>`).
- Corpo: `flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]` (padrão Drawer).
- Seções internas: `SectionTitle` (uppercase `--text-dim`) + `gap-2`.
- Estados: colapsa ao clicar no ícone ativo do rail (toggle); selecionar outro
  ícone troca o conteúdo da MESMA sub-sidebar.

## 4. Run Inspector 300px

- Mesma superfície do §3, `border-l`.
- Header padrão §6 (36px): título "Run Inspector" + chevron collapse.
- Blocos de conteúdo separados por `SectionTitle` (`RUN DETAILS`, `BUDGET &
  COST`); pares label/valor: label `text-xs --text-dim`, valor `font-mono
  text-xs --text`.
- Meter de budget: trilho 4px `bg-[var(--bg-elev-2)]`, preenchimento gradiente
  `--ok-text → --warn-text` (0-100%), labels mono `$spent / $max`.

## 5. Bottom bar (tabs ícone-only)

- Header 30-32px (`--tab-h`), `bg-[var(--bg)] border-t border-[var(--border)]`.
- Tab: `h-full px-2`, ícone 16px (`h-4 w-4`) `--text-dim`, `aria-pressed` +
  tooltip.
- Ativo: `text-[var(--accent-text)]` + barra superior 2px `bg-[var(--accent)]`.
- Hover: `text-[var(--text)] hover:bg-[var(--bg-elev)]`.
- Ícones custom (NÃO lucide/VS Code genéricos): chevron terminal (console),
  janela (terminal), lista (problems), linhas (output).
- Corpo: herda ConsolePanel; altura definida pelo SplitPane (min 120px).

## 6. Header de painel (padrão)

- Altura `--panel-head-h` (36px), `flex items-center justify-between`, `px-3`,
  `border-b border-[var(--border)]`.
- Título: `text-sm font-semibold text-[var(--text)]` (h2).
- Ação direita: botão ícone-only 24px (`h-6 w-6`), `rounded`,
  `duration-[var(--dur-fast)]`, hover `bg-[var(--bg-elev-2)]
  text-[var(--text)]`, `aria-label` sempre presente.
- Primitivo a extrair (ex.: `PanelHeader`) na task do rail.

## 7. Tooltip padrão

- CSS puro via `[data-tip]` + `::after`: conteúdo do atributo, `position
  absolute`, à direita do rail (offset 8px), `bg-[var(--bg-elev-2)]`
  `border border-[var(--border)]`, `text-xs`, `px-1.5 py-0.5`, `rounded`,
  `shadow-[var(--shadow-xs)]`, delay 200ms.
- Acessível: `aria-label`/`title` no elemento-fonte (tooltip é ornamento, nunca
  canal único — padrão TopbarAction).

## 8. Budget pill (flutuante)

- `absolute bottom-3 left-3 z-[5]`, `rounded-md border border-[var(--border)]
  bg-[var(--bg-elev)]/95 backdrop-blur`, `px-2.5 py-1.5`,
  `shadow-[var(--shadow-xs)]`.
- Conteúdo: label `text-xs --text-dim` + valores `font-mono text-xs --text` +
  mini-meter 4px (gradiente §4). Não cobre nós do canvas (fica sobre área de
  fundo).

## 9. Hierarquia tipográfica do shell

| Nível | Exemplo | Classe |
|---|---|---|
| Marca | LoopForge ADE | `text-sm font-semibold` |
| Título de painel | Run Inspector | `text-sm font-semibold` |
| Label de seção | BUDGET & COST | `SectionTitle` (text-xs uppercase) |
| Dados | $0.42, #a3f9 | `font-mono text-xs` |
| Meta | step 4/12 | `text-xs --text-dim` |

## 10. Notas de auditoria (corrigir nas tasks, NÃO nesta fase)

- `text-[10px]`/`text-[11px]` fora da escala em ~14 arquivos (ex.:
  TerminalPanel.tsx:132, HitlDrawer.tsx:291, Drawer.tsx:57 `duration-100`) →
  migrar p/ `--text-2xs`/`--text-xs`/`--dur-fast`.
- `--text-base` (16px), `--node-pm`, `--node-tech-lead`, `--node-qa` sem uso
  (grep 0) — candidatos a remoção ou uso futuro.
- `EmptyState` título usa `text-lg` (fora da escala) — hierarquia invertida vs
  título de painel `text-sm`.
- `tokens.css` `ade-drawer-in`/`ade-banner-in` duplicam `cubic-bezier(0.16,1,
  0.3,1)` literal — usar `var(--ease-out)`.
