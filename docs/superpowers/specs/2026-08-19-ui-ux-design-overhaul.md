# Design — Visual & UX/UI Overhaul: Canvas, Shell & Panels (LoopForge ADE)

Data: 2026-08-19 · Status: aprovado · Escopo: ADE SPA (`web/loopforge-ade/frontend/`)

## 1. Visão Geral & Direção de Design

Transformar a interface do LoopForge ADE em uma experiência de alta densidade, moderna e elegante, inspirada em ferramentas como Linear, Raycast e Vercel. 

### Princípios Visuais
1. **Glassmorphism Escuro Sutil**: Superfícies translúcidas com `backdrop-blur-md` e bordas com fio de luz (`border-white/5` a `border-white/10`).
2. **Identidade Visual por Persona**: Ícones e acentos temáticos para cada papel do pipeline de agentes (CPO, PM, Tech Lead, Test Writer, Developer, QA, AppSec, DevOps).
3. **Fluxo Vivo (Alive Canvas)**: Arestas com partículas/animação de fluxo durante execução, glow pulsante orgânico nos nós ativos e cursor de streaming vívido.
4. **Tipografia & Densidade**: Hierarquia clara com JetBrains Mono para código/métricas e Inter para labels, chips de status com contraste AAA.

---

## 2. Pacote 1 — Canvas & Visual DAG (P1)

### 2.1 Componente `AgentNode` (`src/features/dag/AgentNode.tsx`)
- **Header & Ícones por Papel**:
  - `cpo`: 👑 (Crown / Strategy)
  - `pm`: 📋 (Clipboard / Requirements)
  - `tech_lead`: ⚡ (Zap / Architecture)
  - `test_writer`: 🧪 (Test Tube / Contracts)
  - `developer`: 💻 (Code / Implementation)
  - `qa`: 🛡️ (Shield / Verification)
  - `appsec`: 🔒 (Lock / Security)
  - `devops`: 🚀 (Rocket / Deploy)
  - Custom nodes / gates: ⚙️ / 🚪
- **Visual Elevation**:
  - Gradiente suave superior de 3px com a cor temática do nó.
  - Dot pulsante no canto superior quando `running` ou `streaming`.
  - Micro-interações de hover com sombra colorida difusa e elevação de 2px.

### 2.2 Componente `FlowCanvas` & Edges (`src/features/dag/FlowCanvas.tsx`)
- **Background Grid**: Grid estilo `dots` suave com opacidade reduzida e contraste equilibrado.
- **Floating Controls**: Painel de zoom/fit reposicionado com visual em vidro fosco (`bg-zinc-900/80 backdrop-blur-md border border-white/10 shadow-lg rounded-xl`).
- **Arestas Animadas**: Linhas de conexão entre nós com animação CSS suave quando o nó fonte está em execução.

---

## 3. Pacote 2 — Shell & Glassmorphism (P2)

### 3.1 `Topbar` & `RailNav` (`src/features/topbar/Topbar.tsx`, `src/features/sidebar/RailNav.tsx`)
- **Topbar Translúcida**: Fundo `bg-zinc-950/80 backdrop-blur-xl border-b border-white/5`.
- **Rail Lateral**: Barra de ícones com 48px de largura, indicador deslizante lateral com brilho índigo no ícone ativo e tooltips com delay curto.
- **Command Palette (⌘K)** (`src/features/topbar/CommandPalette.tsx`):
  - Janela central flutuante com sombra profunda `shadow-2xl`.
  - Badges de atalho de teclado `kbd` em estilo retro-moderno (`bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px] px-1.5 py-0.5 rounded`).

---

## 4. Pacote 3 — Sub-Sidebars & Data Viz (P3)

### 4.1 `CoveragePanel` (`src/features/coverage/CoveragePanel.tsx`)
- Card principal com gauge de porcentagem moderno e barras de progresso com degradê suave `from-emerald-500 to-teal-400`.
- Métricas em cards compactos com fundo `bg-zinc-900/60 border border-white/5`.

### 4.2 `GitPanel` (`src/features/git/GitPanel.tsx`)
- Timeline conectada verticalmente com linha de 1px e marcadores circulares indicando status do commit/branch.

### 4.3 `MemoryPanel` & `ArtifactsPanel`
- Cards de memória com badges de escopo coloridas e tags semânticas.
- File tree com ícones reais por extensão de arquivo (`.ts`, `.py`, `.json`, `.md`, `.yml`).

### 4.4 `ConsolePanel` & `TerminalPanel`
- Estilo glass dark com cursor de streaming brilhante e scroll suave.

---

## 5. Critérios de Aceite

1. Todos os componentes respeitam contraste e acessibilidade (WCAG AA).
2. Animações rodam a 60fps sem gargalo no React Flow.
3. Suíte de testes do frontend 100% verde (`npm test`) e build de produção sem erros (`npm run build`).
4. Bundle sincronizado com o engine LoopForge.
