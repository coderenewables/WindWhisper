# GoKaatru v2 — AI-Native Wind Resource Assessment Platform
## Future Version Specification for AI Coding Agents

**Base Version**: GoKaatru v1.0 (March 2026)
**Target Version**: GoKaatru v2.0
**Document Date**: April 2026
**Purpose**: Complete, actionable specification that an AI coding agent can follow to transform the current GoKaatru application into an AI-native wind resource assessment platform.

---

## Table of Contents

1. [Vision & Design Principles](#1-vision--design-principles)
2. [Architecture Evolution](#2-architecture-evolution)
3. [Current Codebase Reference](#3-current-codebase-reference)
4. [New Technology Stack Additions](#4-new-technology-stack-additions)
5. [Database Schema Changes](#5-database-schema-changes)
6. [Backend Implementation Tasks](#6-backend-implementation-tasks)
7. [Frontend Implementation Tasks](#7-frontend-implementation-tasks)
8. [Migration & Compatibility](#8-migration--compatibility)
9. [Testing Strategy](#9-testing-strategy)
10. [Deployment Changes](#10-deployment-changes)

---

## 1. Vision & Design Principles

### 1.1 Core Transformation

GoKaatru v1 is a page-driven application where the user manually navigates Import → QC → Analysis → MCP → Energy → Export → Report. Each page is an isolated workspace. The user is the orchestrator.

GoKaatru v2 transforms this into a **supervised AI operator model** where:

- An AI reasoning layer understands the project state, measurement campaign, data quality history, chosen methods, and commercial objective.
- Deterministic numerical engines (shear, turbulence, Weibull, MCP, AEP, extreme wind) remain unchanged. They are the source of truth. The AI does not replace them — it orchestrates them.
- Every AI recommendation is traceable, auditable, and reversible. The user can accept, edit, reject, or undo any AI action.
- The UI becomes a single **project workspace** rather than a collection of isolated pages.

### 1.2 Design Principles for AI Coding Agents

1. **Additive, not destructive**: All existing v1 backend services, API routes, models, schemas, and frontend components remain functional. New code extends or wraps — never gutting working systems.
2. **AI orchestrates deterministic engines**: The AI layer calls existing service functions (`qc_engine.apply_rules`, `wind_shear.shear_profile`, `mcp_engine.compare_mcp_methods`, etc.). It does not reimplement analysis logic.
3. **Every AI action produces an auditable record**: New `ai_actions` table stores every recommendation, its reasoning, the user's decision, and the downstream effect.
4. **Provenance is mandatory**: Every analysis result links back to the exact data version, filters, assumptions, and parameters that produced it.
5. **The interface is intent-driven**: The primary interaction model shifts from "click menus" to "state what you need" with a command bar and conversational project operator.
6. **Progressive disclosure**: Power users can still access every existing page and manual control. The AI layer is an accelerator, not a cage.

### 1.3 Non-Goals (v2)

- Real-time streaming telemetry ingestion.
- Full micrositing / spatial CFD wind flow modeling.
- Multi-tenant SaaS billing or authentication.
- Replacing scipy/pandas/sklearn computation with LLM inference for numerical results.

---

## 2. Architecture Evolution

### 2.1 v1 Architecture (Current)

```
nginx (:3000)
  /api/* → FastAPI backend (:8000)
  /*     → React SPA (:80)

PostgreSQL (:5432)    Redis (:6379)
```

### 2.2 v2 Architecture (Target)

```
nginx (:3000)
  /api/*        → FastAPI backend (:8000)
  /api/ai/*     → AI orchestration layer (same FastAPI app, new router)
  /api/ws/*     → WebSocket hub (streaming AI responses + progress)
  /*            → React SPA (:80)

PostgreSQL (:5432)    Redis (:6379)    LLM Provider (external API)
```

### 2.3 New Backend Layers

```
backend/app/
├── ai/                          # NEW — AI orchestration layer
│   ├── __init__.py
│   ├── router.py                # /api/ai/* endpoints
│   ├── orchestrator.py          # Central AI reasoning engine
│   ├── planner.py               # Decomposes user intent into action plans
│   ├── agents/                  # Domain-specific AI agents
│   │   ├── __init__.py
│   │   ├── import_agent.py      # Interprets uploaded files
│   │   ├── qc_agent.py          # Anomaly detection & QC recommendations
│   │   ├── analysis_agent.py    # Analysis method selection & interpretation
│   │   ├── mcp_agent.py         # MCP method recommendation & comparison
│   │   ├── energy_agent.py      # Scenario simulation & sensitivity
│   │   ├── report_agent.py      # Report narrative generation
│   │   └── base.py              # Abstract agent interface
│   ├── context.py               # Project state assembly for LLM context
│   ├── tools.py                 # Tool definitions (function calling schema)
│   ├── memory.py                # Conversation & project memory management
│   └── prompts/                 # System prompts for each agent
│       ├── orchestrator.md
│       ├── import_agent.md
│       ├── qc_agent.md
│       ├── analysis_agent.md
│       ├── mcp_agent.md
│       ├── energy_agent.md
│       └── report_agent.md
├── api/                         # EXISTING — unchanged
├── models/                      # EXISTING — extended with new tables
├── schemas/                     # EXISTING — extended with new schemas
├── services/                    # EXISTING — unchanged (AI layer calls these)
└── utils/                       # EXISTING — extended
```

### 2.4 New Frontend Layers

```
frontend/src/
├── ai/                          # NEW — AI interaction layer
│   ├── AiProvider.tsx           # React context for AI state
│   ├── useAiChat.ts            # Hook for conversational AI interaction
│   ├── useAiActions.ts         # Hook for AI action tracking & approval
│   └── aiClient.ts             # WebSocket + REST client for /api/ai/*
├── components/
│   ├── ai/                      # NEW — AI UI components
│   │   ├── CommandBar.tsx       # Global command bar (Cmd+K)
│   │   ├── AiChatPanel.tsx      # Conversational project operator panel
│   │   ├── ActionCard.tsx       # Single AI recommendation card
│   │   ├── ActionTimeline.tsx   # Timeline of AI actions with approval states
│   │   ├── InsightBanner.tsx    # Contextual insight notification
│   │   ├── ProjectHealth.tsx    # AI-generated project health dashboard
│   │   └── UncertaintyStack.tsx # Uncertainty breakdown visualization
│   ├── workspace/               # NEW — unified workspace components
│   │   ├── WorkspaceCanvas.tsx  # Central project workspace layout
│   │   ├── DataArrivalPanel.tsx # New data notification & auto-interpretation
│   │   ├── IssueTracker.tsx     # Unresolved anomalies & decisions tracker
│   │   └── ScenarioManager.tsx  # Energy scenario comparison panel
│   └── ...existing/             # ALL existing components remain
├── pages/
│   ├── WorkspacePage.tsx        # NEW — unified AI workspace (replaces home)
│   └── ...existing/             # ALL existing pages remain (accessible)
├── stores/
│   ├── aiStore.ts               # NEW — AI conversation & action state
│   └── ...existing/             # ALL existing stores remain
└── types/
    ├── ai.ts                    # NEW — AI action, recommendation, insight types
    └── ...existing/             # ALL existing types remain
```

---

## 3. Current Codebase Reference

This section maps every existing artifact that the AI layer must integrate with. AI coding agents must read and understand these files before modifying them.

### 3.1 Backend Services (AI Layer Calls These)

| Service File | Key Functions the AI Layer Calls | Purpose |
|---|---|---|
| `services/qc_engine.py` | `get_clean_dataframe()`, `apply_rules()`, `load_dataset_frame()`, `filter_flagged_data()` | Data loading with QC filtering |
| `services/wind_shear.py` | `shear_profile()`, `extrapolate_speed()`, `calculate_power_law_alpha()` | Shear computation |
| `services/turbulence.py` | `ti_by_speed_bin()`, `ti_summary()`, `ti_by_direction()` | TI analysis |
| `services/weibull.py` | `fit_weibull()` | Weibull distribution fitting |
| `services/extreme_wind.py` | `extreme_wind_summary()` | Extreme wind analysis |
| `services/air_density.py` | `calculate_air_density()`, `air_density_summary()` | Air density computation |
| `services/mcp_engine.py` | `compare_mcp_methods()`, `mcp_linear_least_squares()`, `mcp_variance_ratio()`, `mcp_matrix_method()`, `correlation_stats()` | MCP long-term adjustment |
| `services/energy_estimate.py` | `gross_energy_estimate()`, `energy_by_month()`, `energy_by_speed_bin()` | Energy production estimates |
| `services/data_reconstruction.py` | `run_reconstruction()`, `identify_gaps()` | Gap filling |
| `services/tower_shadow.py` | `detect_tower_shadow()` | Tower shadow detection |
| `services/export_engine.py` | `export_csv()`, `export_wasp_tab()`, `export_iea_json()`, `export_kml()` | Data export |
| `services/report_generator.py` | `generate_report()` | Report generation |
| `services/history.py` | `record_change()`, `get_history()`, `undo_last()` | Change tracking |
| `services/workflow_engine.py` | `run_workflow()` | Automated workflow execution |
| `services/reanalysis_download.py` | `create_download_task()`, `get_download_task()` | Reference data download |

### 3.2 Backend API Routes (AI Layer Wraps These)

The AI orchestrator does NOT call HTTP endpoints. It calls the service functions directly, sharing the same database session. The existing REST endpoints remain unchanged for manual UI access.

### 3.3 Existing Database Models

| Model File | Tables | The AI Layer Uses |
|---|---|---|
| `models/project.py` | `projects` | Read project metadata, coordinates, elevation |
| `models/dataset.py` | `datasets`, `data_columns` | Read dataset structure, column types, heights |
| `models/timeseries.py` | `timeseries_data` | Read via `qc_engine.get_clean_dataframe()` |
| `models/flag.py` | `flags`, `flag_rules`, `flagged_ranges` | Read/write QC state |
| `models/analysis_result.py` | `analysis_results` | Read/write cached analysis results |
| `models/change_log.py` | `change_logs` | Read/write audit trail |
| `models/power_curve.py` | `power_curves` | Read turbine power curves |
| `models/workflow.py` | `workflows` | Read/write automated pipelines |

### 3.4 Existing Frontend Pages

| Page | Route | AI Integration Point |
|---|---|---|
| `DashboardPage.tsx` | `/` | Will link to new `WorkspacePage` for AI-driven projects |
| `ImportPage.tsx` | `/import` | Import agent provides smart column mapping suggestions |
| `QCPage.tsx` | `/qc` | QC agent surfaces anomaly recommendations inline |
| `AnalysisPage.tsx` | `/analysis` | Analysis agent suggests next analyses, interprets results |
| `MCPPage.tsx` | `/mcp` | MCP agent recommends methods, explains tradeoffs |
| `EnergyPage.tsx` | `/energy` | Energy agent runs scenario comparisons |
| `ExportPage.tsx` | `/export` | Report agent generates narrative sections |
| `TimeSeriesPage.tsx` | `/timeseries` | AI identifies visual anomalies on chart |
| `ProjectPage.tsx` | `/project/:id` | Project health summary from AI |
| `WorkflowsPage.tsx` | `/workflows` | AI can suggest and auto-build workflows |

---

## 4. New Technology Stack Additions

### 4.1 Backend Additions

| Component | Technology | Purpose |
|---|---|---|
| LLM Client | `litellm` or `openai` Python SDK | Unified LLM API client (supports OpenAI, Anthropic, local models) |
| Function Calling | OpenAI-compatible tool/function schema | AI tools that map to existing service functions |
| WebSocket | `fastapi.WebSocket` | Streaming AI responses to frontend |
| Token Management | `tiktoken` | Context window management and token counting |
| Vector Search (optional) | `pgvector` extension on PostgreSQL | Semantic search over project notes and past decisions |
| Background Tasks | Existing Redis + `asyncio` | Long-running AI analysis chains |

### 4.2 Frontend Additions

| Component | Technology | Purpose |
|---|---|---|
| Markdown Rendering | `react-markdown` + `remark-gfm` | Render AI responses with formatted text, tables, code |
| WebSocket Client | Native `WebSocket` API (wrapped in hook) | Streaming AI chat responses |
| Command Palette | Custom component (or `cmdk`) | Global Cmd+K command bar |
| KaTeX | `katex` + `react-katex` | Render mathematical formulas in AI explanations |

### 4.3 Configuration Additions

New environment variables in `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | LLM provider: `openai`, `anthropic`, `azure`, `local` |
| `LLM_API_KEY` | (required) | API key for the LLM provider |
| `LLM_MODEL` | `gpt-4o` | Model identifier |
| `LLM_BASE_URL` | (provider default) | Custom endpoint for local/Azure deployments |
| `AI_ENABLED` | `true` | Feature flag to enable/disable AI features |
| `AI_MAX_TOKENS_PER_REQUEST` | `4096` | Max output tokens per AI request |
| `AI_CONTEXT_WINDOW` | `128000` | Context window size for context assembly |

---

## 5. Database Schema Changes

### 5.1 New Tables

```sql
-- AI conversation threads per project
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual messages in a conversation
CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,                -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls JSONB,                         -- function call requests from the LLM
    tool_call_id VARCHAR(255),                -- for tool response messages
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated actions awaiting user approval
CREATE TABLE ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,         -- 'qc_recommendation', 'analysis_suggestion', 'mcp_recommendation',
                                              -- 'import_mapping', 'report_narrative', 'scenario_result', 'insight'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reasoning TEXT,                            -- AI's explanation of why this action was recommended
    payload JSONB NOT NULL,                    -- structured action data (varies by action_type)
    status VARCHAR(20) DEFAULT 'pending',     -- 'pending', 'accepted', 'rejected', 'auto_applied', 'expired'
    impact_summary JSONB,                     -- estimated downstream impact of accepting/rejecting
    resolved_by VARCHAR(20),                  -- 'user' or 'auto'
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Project-level AI memory (persistent context across conversations)
CREATE TABLE ai_project_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL,         -- 'campaign_config', 'sensor_event', 'method_preference',
                                              -- 'assumption', 'decision_rationale', 'lesson_learned'
    content TEXT NOT NULL,
    metadata JSONB,                           -- structured data associated with this memory
    source_action_id UUID REFERENCES ai_actions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Analysis provenance tracking (links results to exact inputs)
CREATE TABLE analysis_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    column_ids UUID[],                        -- which data columns were used
    excluded_flag_ids UUID[],                 -- which QC flags were active
    data_hash VARCHAR(64),                    -- SHA-256 of the input data slice
    parameters_hash VARCHAR(64),              -- SHA-256 of the analysis parameters
    time_range_start TIMESTAMPTZ,
    time_range_end TIMESTAMPTZ,
    record_count INTEGER,
    data_recovery_pct DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Project health snapshots (periodic AI-computed summaries)
CREATE TABLE project_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    health_score DOUBLE PRECISION,            -- 0-100 composite score
    summary TEXT,                             -- natural language summary
    issues JSONB,                             -- list of unresolved issues / blockers
    metrics JSONB,                            -- key metrics snapshot
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 Alembic Migration

Create a new migration file: `backend/alembic/versions/20260402_0005_ai_tables.py`

Must define `upgrade()` creating all five new tables and `downgrade()` dropping them in reverse order. Follow the existing migration pattern in `20260325_0001_initial_tables.py`.

### 5.3 Existing Table Modifications

No existing tables are modified. The AI layer works alongside existing data through foreign key references and reads via existing service functions.

---

## 6. Backend Implementation Tasks

### Task F1: LLM Client & Configuration
**Dependencies**: None
**Files to Create**:
- `backend/app/ai/__init__.py`
- `backend/app/ai/llm_client.py`
- `backend/app/config.py` (extend with AI settings)

**Implementation Details**:

1. Extend `config.py` `Settings` class with new fields:
   ```python
   llm_provider: str = "openai"
   llm_api_key: str = ""
   llm_model: str = "gpt-4o"
   llm_base_url: str | None = None
   ai_enabled: bool = True
   ai_max_tokens_per_request: int = 4096
   ai_context_window: int = 128000
   ```

2. Create `llm_client.py`:
   - `class LLMClient`:
     - `__init__(settings: Settings)` — initialize the underlying SDK client based on `llm_provider`
     - `async def chat_completion(messages: list[dict], tools: list[dict] | None, temperature: float = 0.1, max_tokens: int | None) -> dict` — send a chat completion request with optional function calling tools
     - `async def stream_chat_completion(messages, tools, temperature, max_tokens) -> AsyncIterator[dict]` — streaming variant that yields delta chunks
     - `def count_tokens(text: str) -> int` — count tokens using tiktoken for context management
     - `def get_model_context_window() -> int` — return context window for the configured model
   - Use `litellm` as the unified backend so the same code works for OpenAI, Anthropic, Azure, and local models.
   - All API keys must come from `Settings` (env vars), never hardcoded.
   - Rate limit handling with exponential backoff (3 retries, starting at 1s).
   - Timeout: 120s for standard completion, 300s for streaming.

3. Create `backend/tests/test_ai_client.py`:
   - Mock the LLM provider.
   - Test that `chat_completion` returns structured output.
   - Test that `stream_chat_completion` yields chunks.
   - Test rate-limit retry logic.
   - Test token counting.

**Acceptance Criteria**:
- [ ] `LLMClient` initializes based on environment config
- [ ] Chat completion returns structured responses with tool calls
- [ ] Streaming yields delta chunks
- [ ] Token counting works
- [ ] Tests pass with mocked LLM provider
- [ ] No API key is hardcoded anywhere

---

### Task F2: AI Tool Definitions (Function Calling Schema)
**Dependencies**: Task F1
**Files to Create**:
- `backend/app/ai/tools.py`

**Implementation Details**:

Define OpenAI-compatible function/tool schemas that map directly to existing GoKaatru service functions. The AI will call these tools via function calling, and the orchestrator will execute the corresponding service function.

Each tool definition must include:
- `name`: snake_case function name
- `description`: what the tool does (1-3 sentences, domain-specific)
- `parameters`: JSON Schema for the arguments

Tool categories and their mappings:

**Data Inspection Tools** (read-only, safe to auto-execute):
| Tool Name | Maps To | Description |
|---|---|---|
| `list_project_datasets` | `GET /projects/{id}/datasets` query | List all datasets in a project with column info |
| `get_dataset_summary` | `GET /datasets/{id}` query | Get dataset detail: columns, row count, date range, recovery |
| `get_timeseries_sample` | `qc_engine.load_dataset_frame()` | Load a sample of timeseries data (first/last N rows or specific date range) |
| `get_data_statistics` | pandas `.describe()` on loaded frame | Get per-column statistics: mean, std, min, max, nulls, recovery% |
| `get_flagged_ranges` | `GET /qc/datasets/{id}/flagged-ranges` query | List all QC flagged ranges for a dataset |
| `get_analysis_history` | `analysis_results` table query | List all previously-run analyses and their results for a dataset |
| `get_change_history` | `history.get_history()` | Get the audit trail for a dataset |
| `get_project_metadata` | `GET /projects/{id}` query | Get project name, coordinates, elevation, dataset count |
| `list_power_curves` | `GET /analysis/power-curves` query | List available power curves in the library |

**Analysis Tools** (compute, return results, require user approval to persist):
| Tool Name | Maps To | Description |
|---|---|---|
| `run_wind_rose` | `services.weibull` + wind rose logic in `api/analysis.py` | Compute wind rose for direction+speed columns |
| `run_histogram` | histogram logic in `api/analysis.py` | Compute frequency histogram for a column |
| `run_weibull_fit` | `services.weibull.fit_weibull()` | Fit Weibull distribution to speed data |
| `run_shear_analysis` | `services.wind_shear.shear_profile()` | Compute wind shear between height pairs |
| `run_turbulence_analysis` | `services.turbulence.*` | Compute TI analysis with IEC classification |
| `run_air_density` | `services.air_density.*` | Compute air density from temp/pressure |
| `run_extreme_wind` | `services.extreme_wind.extreme_wind_summary()` | Compute extreme wind analysis with Gumbel fit |
| `run_mcp_comparison` | `services.mcp_engine.compare_mcp_methods()` | Run all MCP methods, cross-validate, rank |
| `run_mcp_prediction` | `services.mcp_engine.mcp_*()` | Run a specific MCP method |
| `run_energy_estimate` | `services.energy_estimate.gross_energy_estimate()` | Compute AEP for a speed column + power curve |
| `run_gap_identification` | `services.data_reconstruction.identify_gaps()` | Find data gaps in a column |
| `run_correlation` | `services.mcp_engine.correlation_stats()` | Compute correlation between two series |

**Action Tools** (mutate state, ALWAYS require user approval):
| Tool Name | Maps To | Description |
|---|---|---|
| `create_qc_flag` | `POST /qc/flags/{dataset_id}` logic | Create a new QC flag |
| `add_flag_rule` | `POST /qc/flags/{flag_id}/rules` logic | Add a rule to an existing flag |
| `apply_flag_rules` | `services.qc_engine.apply_rules()` | Execute flag rules and generate flagged ranges |
| `run_gap_fill` | `services.data_reconstruction.run_reconstruction()` | Fill data gaps with specified method |
| `create_extrapolated_channel` | shear extrapolation + persist logic | Create a new column from shear extrapolation |
| `generate_report` | `services.report_generator.generate_report()` | Generate a PDF/DOCX report |
| `export_data` | `services.export_engine.export_*()` | Export data in specified format |

**Reasoning Tools** (AI-internal, no service mapping):
| Tool Name | Purpose |
|---|---|
| `record_insight` | Store a project insight or finding in `ai_project_memory` |
| `recall_project_memory` | Retrieve relevant memories for the current project |
| `assess_project_health` | Compute project health score from current state |
| `estimate_downstream_impact` | Estimate how an action (e.g., flagging data) affects downstream results |

Each tool must validate its arguments before executing. All tools return structured JSON that the LLM can interpret.

**Acceptance Criteria**:
- [ ] All tool schemas are valid OpenAI function-calling JSON
- [ ] Data inspection tools map to correct queries
- [ ] Analysis tools map to correct service functions
- [ ] Action tools are clearly marked as requiring approval
- [ ] Each tool has a specific, non-generic description

---

### Task F3: Project Context Assembly
**Dependencies**: Tasks F1, F2
**Files to Create**:
- `backend/app/ai/context.py`

**Implementation Details**:

The context assembler builds a structured project snapshot that fits within the LLM's context window. It is called before every AI interaction to provide the model with current project state.

1. `class ProjectContext`:
   - `async def assemble(db: AsyncSession, project_id: UUID, conversation_id: UUID | None, max_tokens: int) -> list[dict]`:
     - Builds a list of chat messages representing the current project state.
     - Prioritizes information by relevance (most recent first, most impactful first).
     - Truncates to fit within `max_tokens`.
   - Context sections (in priority order):
     1. **Project metadata**: name, coordinates, elevation, creation date, total datasets.
     2. **Dataset inventory**: for each dataset — name, source type, date range, column count, row count, data recovery %, column list with types/heights.
     3. **QC state**: active flags, flagged percentage per column, unresolved anomalies.
     4. **Analysis results summary**: which analyses have been run, key results (mean speed, Weibull k/A, shear alpha, TI class, V_e50, AEP).
     5. **Recent changes**: last 10 change log entries.
     6. **Project memory**: relevant AI memories (method preferences, sensor events, decisions).
     7. **Pending actions**: any AI recommendations awaiting user approval.
     8. **Conversation history**: recent messages from the current conversation (truncated to fit).

2. `def format_dataset_summary(dataset, columns, flags) -> str`:
   - Returns a concise text block summarizing one dataset.
   - Example:
     ```
     Dataset: "Met Mast Alpha" (met_tower)
     Period: 2024-01-01 to 2025-12-31 (730 days)
     Columns: Speed_80m (speed, 80m), Speed_60m (speed, 60m), Dir_80m (direction, 80m), Temp_2m (temperature, 2m), ...
     Recovery: 94.2% overall
     QC Flags: 3 active (icing: 2.1%, tower_shadow: 4.3%, spike: 0.8%)
     ```

3. `def format_analysis_summary(results: list[AnalysisResult]) -> str`:
   - Returns key metrics extracted from cached `analysis_results`.
   - Example:
     ```
     Completed Analyses:
     - Weibull (Speed_80m): k=2.14, A=7.82 m/s, mean=6.93 m/s
     - Shear (60m→80m): α=0.18 (power law)
     - Turbulence (80m): TI_rep@15=0.128, IEC Class B
     - Extreme Wind: V_e50=42.3 m/s (Gumbel, 2 years data — LOW CONFIDENCE)
     ```

4. Token budget allocation:
   - System prompt: 2000 tokens reserved
   - Project context: up to 40% of remaining budget
   - Conversation history: up to 40% of remaining budget
   - Tool results: up to 20% of remaining budget
   - Use `LLMClient.count_tokens()` for measurement

**Acceptance Criteria**:
- [ ] Context assembler produces a structured project summary
- [ ] Token budget is respected; output fits within configured context window
- [ ] Empty projects produce minimal but valid context
- [ ] Large projects are truncated intelligently (most relevant first)
- [ ] Dataset summaries include column types, heights, and recovery

---

### Task F4: AI Orchestrator & Action Execution
**Dependencies**: Tasks F1, F2, F3
**Files to Create**:
- `backend/app/ai/orchestrator.py`
- `backend/app/ai/action_executor.py`

**Implementation Details**:

1. `class AiOrchestrator`:
   - The central reasoning engine. Receives user messages, assembles context, calls the LLM with tools, executes tool calls, and returns responses.
   
   - `async def process_message(db: AsyncSession, project_id: UUID, conversation_id: UUID, user_message: str) -> AsyncIterator[dict]`:
     - Assemble project context using `ProjectContext.assemble()`.
     - Build message list: system prompt + context + conversation history + user message.
     - Call `LLMClient.stream_chat_completion()` with tools enabled.
     - For each tool call in the response:
       - If the tool is a **data inspection** or **analysis** tool: execute immediately, append tool result to messages, continue the conversation loop.
       - If the tool is an **action** tool: create an `ai_actions` record with status `pending`, include the action in the response for user approval. Do NOT execute until approved.
       - If the tool is a **reasoning** tool: execute immediately (internal AI state).
     - Yield streaming response chunks to the frontend via WebSocket.
     - The orchestrator may loop (tool call → result → further reasoning) up to 10 iterations per user message.
   
   - `async def approve_action(db: AsyncSession, action_id: UUID) -> dict`:
     - Load the `ai_actions` record.
     - Execute the action using `ActionExecutor`.
     - Update status to `accepted`, set `resolved_by='user'`, `resolved_at=now()`.
     - Record the change in `change_logs` via `history.record_change()`.
     - Return the execution result (e.g., "Applied icing flag: 2.1% data excluded, mean speed changed from 6.93 to 7.06 m/s").

   - `async def reject_action(db: AsyncSession, action_id: UUID, reason: str | None) -> dict`:
     - Update status to `rejected`, save the reason.
     - Record the decision in `ai_project_memory` as a `decision_rationale`.

2. `class ActionExecutor`:
   - Maps `ai_actions.action_type` + `ai_actions.payload` to service function calls.
   
   - `async def execute(db: AsyncSession, action: AiAction) -> dict`:
     - Dispatch based on `action.action_type`:
       - `qc_recommendation`: Call `qc_engine.apply_rules()` or create flags/rules.
       - `analysis_suggestion`: Call the appropriate analysis service function.
       - `mcp_recommendation`: Call `mcp_engine.*` with recommended method and params.
       - `import_mapping`: Apply the suggested column mapping and confirm import.
       - `report_narrative`: Inject the generated narrative text into report generation.
       - `scenario_result`: Execute energy estimate with specified scenario params.
     - Every execution MUST call `history.record_change()` for audit trail.
     - Return structured result with before/after state.

3. System prompt (`backend/app/ai/prompts/orchestrator.md`):
   - Must define the AI's role: "You are a wind resource assessment engineer working inside the GoKaatru platform."
   - Must establish constraints:
     - "NEVER invent numerical results. Always call the appropriate analysis tool and report the actual result."
     - "NEVER execute action tools without user approval. Always present action recommendations with clear reasoning."
     - "When recommending a method, explain WHY and what the alternatives are."
     - "When presenting results, always state which data was used, which filters were applied, and what the sensitivity is."
     - "If data is insufficient for a reliable analysis, say so clearly."
   - Must include domain knowledge:
     - IEC standard references for turbulence classification.
     - Typical shear exponent ranges (0.1-0.3 for most terrains).
     - Minimum data requirements (1 year for reliable extreme wind, 6+ months for MCP).
     - Common QC patterns (icing, tower shadow, sensor drift, flat-lining).

**Acceptance Criteria**:
- [ ] Orchestrator correctly loops through tool calls
- [ ] Data inspection tools execute immediately
- [ ] Action tools create pending records, do NOT auto-execute
- [ ] `approve_action` executes and records the change
- [ ] `reject_action` stores the reason in project memory
- [ ] Streaming responses are yielded to the caller
- [ ] Maximum 10 tool call iterations per message

---

### Task F5: Domain-Specific AI Agents
**Dependencies**: Task F4
**Files to Create**:
- `backend/app/ai/agents/base.py`
- `backend/app/ai/agents/import_agent.py`
- `backend/app/ai/agents/qc_agent.py`
- `backend/app/ai/agents/analysis_agent.py`
- `backend/app/ai/agents/mcp_agent.py`
- `backend/app/ai/agents/energy_agent.py`
- `backend/app/ai/agents/report_agent.py`
- `backend/app/ai/prompts/import_agent.md`
- `backend/app/ai/prompts/qc_agent.md`
- `backend/app/ai/prompts/analysis_agent.md`
- `backend/app/ai/prompts/mcp_agent.md`
- `backend/app/ai/prompts/energy_agent.md`
- `backend/app/ai/prompts/report_agent.md`

**Implementation Details**:

The orchestrator delegates to domain-specific agents for complex tasks. Each agent has a focused system prompt, a restricted tool set, and domain expertise.

1. `class BaseAgent` (abstract):
   ```python
   class BaseAgent:
       name: str
       system_prompt_path: str
       allowed_tools: list[str]
       
       async def run(self, db, project_id, task_description, context) -> AgentResult
   ```

2. **Import Agent** (`import_agent.py`):
   - Triggered when: new files are uploaded or user asks about data interpretation.
   - Capabilities:
     - Analyze detected column names from `auto_detect.py` output.
     - Cross-reference with known naming conventions (NRG, Campbell, Ammonit, Windographic).
     - Identify likely sensor swaps, miscalibrations, or unit errors by inspecting data statistics.
     - Suggest column mapping corrections with confidence levels.
     - Detect probable sensor heights from column names and data patterns.
   - Allowed tools: `list_project_datasets`, `get_dataset_summary`, `get_timeseries_sample`, `get_data_statistics`, `record_insight`.
   - Agent prompt includes:
     - Common logger naming conventions table.
     - Typical range checks per measurement type (speed 0-50 m/s, direction 0-360°, temperature -40 to 60°C, pressure 500-1100 hPa).
     - Likely sensor height indicators in column names.

3. **QC Agent** (`qc_agent.py`):
   - Triggered when: user asks for QC review, or periodically after data import.
   - Capabilities:
     - Run `get_data_statistics` and `get_timeseries_sample` to inspect data.
     - Identify anomaly patterns:
       - **Icing**: temperature < 2°C with speed_sd ≈ 0 and unusual speed drops.
       - **Tower shadow**: directional speed depression at known boom azimuths.
       - **Flat-lining**: extended periods of zero standard deviation.
       - **Spikes**: values exceeding 4σ from rolling mean.
       - **Drift**: slow monotonic trend in sensor readings.
       - **Sensor swaps**: abrupt change in correlation between paired sensors.
     - Estimate downstream impact of each QC recommendation:
       - "Excluding this icing period would change mean wind speed from X.XX to Y.YY m/s (Z.Z% increase)."
     - Group recommendations by severity (critical / warning / info).
   - Allowed tools: `get_data_statistics`, `get_timeseries_sample`, `get_flagged_ranges`, `run_histogram`, `run_correlation`, `create_qc_flag`, `add_flag_rule`, `apply_flag_rules`, `estimate_downstream_impact`, `record_insight`.

4. **Analysis Agent** (`analysis_agent.py`):
   - Triggered when: user asks for analysis, or after QC is completed.
   - Capabilities:
     - Examine current analysis state (which analyses have been run, which are missing).
     - Suggest a logical analysis sequence based on available data.
     - Interpret analysis results in context:
       - "The Weibull k of 1.8 indicates a moderate wind regime. The site is below IEC Class III threshold."
       - "Shear alpha of 0.28 is unusually high — check for measurement height errors or complex terrain."
       - "V_e50 estimate has low confidence because only 14 months of data are available."
     - Identify when results are inconsistent and flag for review.
   - Allowed tools: `get_analysis_history`, `run_wind_rose`, `run_histogram`, `run_weibull_fit`, `run_shear_analysis`, `run_turbulence_analysis`, `run_air_density`, `run_extreme_wind`, `record_insight`.

5. **MCP Agent** (`mcp_agent.py`):
   - Triggered when: user asks about long-term adjustment, or after short-term analysis.
   - Capabilities:
     - Assess whether MCP is needed and feasible (is data period < 10 years? is reference data available?).
     - Download or identify reference datasets (ERA5/MERRA-2) if not already present.
     - Run `compare_mcp_methods` and interpret cross-validation results.
     - Explain method stability: "Linear regression shows overfit behavior with R²_cv=0.62 vs R²_train=0.89. Variance ratio is more stable."
     - Recommend the best method based on holdout performance, not default habit.
     - Check for seasonal bias: "Correlation is weaker in summer (R²=0.45) than winter (R²=0.78). Consider seasonal MCP."
   - Allowed tools: `list_project_datasets`, `get_dataset_summary`, `run_correlation`, `run_mcp_comparison`, `run_mcp_prediction`, `record_insight`.

6. **Energy Agent** (`energy_agent.py`):
   - Triggered when: user asks about energy production, AEP, or scenario comparison.
   - Capabilities:
     - Run energy estimates across multiple scenarios (different heights, density adjustments, curtailment levels).
     - Compare scenarios in a structured table.
     - Identify which input has the largest effect on yield uncertainty (shear, MCP method, power curve low-speed region, density).
     - Compute P50/P75/P90 estimates based on uncertainty stack.
   - Allowed tools: `run_energy_estimate`, `run_shear_analysis`, `list_power_curves`, `get_analysis_history`, `record_insight`.

7. **Report Agent** (`report_agent.py`):
   - Triggered when: user asks for a report or narrative summary.
   - Capabilities:
     - Generate natural-language section narratives for each report section.
     - Assemble an assumptions table from analysis provenance records.
     - Adjust narrative tone for different audiences (technical due diligence, executive summary, internal memo).
     - Identify gaps in the analysis that should be addressed before reporting.
   - Allowed tools: `get_project_metadata`, `get_analysis_history`, `recall_project_memory`, `generate_report`, `record_insight`.

**Acceptance Criteria**:
- [ ] Each agent has a focused system prompt with domain knowledge
- [ ] Each agent is restricted to its allowed tool set
- [ ] QC agent detects at least: icing, tower shadow, flat-lining, spikes
- [ ] Analysis agent interprets results with domain context
- [ ] MCP agent evaluates method stability via cross-validation
- [ ] Energy agent supports multi-scenario comparison
- [ ] Report agent generates audience-appropriate narratives
- [ ] All agents produce structured `AgentResult` objects

---

### Task F6: AI Project Memory
**Dependencies**: Task F4
**Files to Create**:
- `backend/app/ai/memory.py`

**Implementation Details**:

Project memory provides persistent context that survives across conversations. This is how the AI "remembers" the project history and user preferences.

1. `class ProjectMemory`:
   - `async def store(db, project_id, memory_type, content, metadata, source_action_id) -> AiProjectMemory`:
     - Insert into `ai_project_memory` table.
     - Memory types:
       - `campaign_config`: mast configuration, sensor replacement events, boom orientations.
       - `sensor_event`: "Anemometer at 80m was replaced on 2025-03-15. Data before and after may have different calibration."
       - `method_preference`: "User prefers variance ratio MCP for this campaign due to non-linear correlation."
       - `assumption`: "Hub height target is 120m for the Vestas V150."
       - `decision_rationale`: "Rejected AI recommendation to exclude March data because field log confirms sensor was operational."
       - `lesson_learned`: "Low-speed power curve region is sensitive — always check against measured scatter."
   
   - `async def recall(db, project_id, query: str | None, memory_types: list[str] | None, limit: int = 20) -> list[AiProjectMemory]`:
     - If `query` is provided and `pgvector` is installed: semantic search.
     - Otherwise: filter by `memory_types`, order by `updated_at` desc, limit.
   
   - `async def update(db, memory_id, content, metadata) -> AiProjectMemory`:
     - Update an existing memory entry.
   
   - `async def forget(db, memory_id)`:
     - Delete a memory entry.

2. Automatic memory creation:
   - When an action is approved → store the decision and reasoning as a `decision_rationale` memory.
   - When an action is rejected → store the rejection reason as a `decision_rationale` memory.
   - When import interprets a file → store the sensor configuration as a `campaign_config` memory.
   - When the user states a preference → store as `method_preference`.

**Acceptance Criteria**:
- [ ] Memories are stored and retrieved correctly
- [ ] Recall filters by type and recency
- [ ] Approved/rejected actions automatically create memories
- [ ] Memories appear in project context for future conversations
- [ ] Memories can be edited and deleted by the user

---

### Task F7: Analysis Provenance Tracking
**Dependencies**: Task F4
**Files to Create**:
- `backend/app/ai/provenance.py`

**Implementation Details**:

Every analysis result must link to its exact inputs for reproducibility and auditability.

1. `class ProvenanceTracker`:
   - `async def record(db, analysis_result_id, dataset_id, column_ids, excluded_flag_ids, time_range, data_frame) -> AnalysisProvenance`:
     - Compute `data_hash` as SHA-256 of the input DataFrame values (after flag filtering).
     - Compute `parameters_hash` as SHA-256 of the analysis parameters JSON.
     - Record count and data recovery percentage.
   
   - `async def verify(db, provenance_id) -> dict`:
     - Reload the data with the same parameters.
     - Recompute the hash.
     - Return `{ "valid": True/False, "reason": "..." }`.
   
   - `async def diff(db, provenance_id_a, provenance_id_b) -> dict`:
     - Compare two provenance records.
     - Return what changed: different columns, different flags, different time range, different data.

2. Integration points:
   - Every analysis service function that stores an `AnalysisResult` must also call `ProvenanceTracker.record()`.
   - Modify the existing analysis endpoints in `backend/app/api/analysis.py` to call provenance tracking after storing results. The existing endpoint signatures and response schemas do NOT change — provenance is stored as a side effect.

**Acceptance Criteria**:
- [ ] Every analysis result has a provenance record
- [ ] Data hash is computed from the actual input data
- [ ] Provenance can be verified (hash comparison)
- [ ] Two provenance records can be diffed
- [ ] Existing analysis endpoints are not broken

---

### Task F8: AI API Router & WebSocket Hub
**Dependencies**: Tasks F4, F5, F6
**Files to Create**:
- `backend/app/ai/router.py`
- `backend/app/ai/websocket_hub.py`
- `backend/app/main.py` (register new router)

**Implementation Details**:

1. Create `router.py` with prefix `/api/ai`:

   **REST Endpoints**:
   | Method | Path | Description |
   |---|---|---|
   | POST | `/conversations/{project_id}` | Create a new conversation for a project |
   | GET | `/conversations/{project_id}` | List conversations for a project |
   | GET | `/conversations/{project_id}/{conversation_id}` | Get conversation with messages |
   | DELETE | `/conversations/{conversation_id}` | Delete a conversation |
   | POST | `/conversations/{conversation_id}/messages` | Send a user message (triggers AI processing) |
   | POST | `/actions/{action_id}/approve` | Approve a pending AI action |
   | POST | `/actions/{action_id}/reject` | Reject a pending AI action (accepts optional `reason` body) |
   | GET | `/actions/{project_id}` | List AI actions for a project (filterable by status) |
   | GET | `/actions/{project_id}/pending` | List pending actions only |
   | GET | `/memory/{project_id}` | List AI memories for a project |
   | POST | `/memory/{project_id}` | Manually create a memory |
   | PUT | `/memory/{memory_id}` | Update a memory |
   | DELETE | `/memory/{memory_id}` | Delete a memory |
   | GET | `/health/{project_id}` | Get latest project health snapshot |
   | POST | `/health/{project_id}/refresh` | Trigger a fresh project health assessment |
   | GET | `/status` | Check AI subsystem status (LLM connectivity, model, token usage) |

2. Create `websocket_hub.py`:
   - `WebSocket endpoint: /api/ai/ws/{project_id}/{conversation_id}`
   - Client sends: `{ "type": "message", "content": "..." }`
   - Server streams back:
     - `{ "type": "token", "content": "partial text..." }` — streaming text
     - `{ "type": "tool_call", "tool": "run_weibull_fit", "args": {...} }` — tool being executed
     - `{ "type": "tool_result", "tool": "run_weibull_fit", "result": {...} }` — tool result
     - `{ "type": "action_pending", "action": {...} }` — new action awaiting approval
     - `{ "type": "complete", "message_id": "..." }` — response complete
     - `{ "type": "error", "message": "..." }` — error occurred
   - Connection management:
     - Track active connections per project/conversation.
     - Clean up on disconnect.
     - Heartbeat ping every 30s.

3. Register the AI router in `main.py`:
   ```python
   from app.ai.router import router as ai_router
   # Conditionally include based on AI_ENABLED setting
   if settings.ai_enabled:
       app.include_router(ai_router)
   ```

4. Define Pydantic schemas for all AI endpoints in `backend/app/schemas/ai.py`:
   - `AiConversationResponse`, `AiMessageResponse`, `AiActionResponse`, `AiMemoryResponse`, `AiHealthResponse`, `AiStatusResponse`, `AiMessageCreateRequest`, `AiMemoryCreateRequest`, `AiActionRejectRequest`.

**Acceptance Criteria**:
- [ ] All REST endpoints return correct responses
- [ ] WebSocket connection is established and streams tokens
- [ ] Tool calls and results are streamed correctly
- [ ] Pending actions are sent via WebSocket
- [ ] AI router is only registered when `AI_ENABLED=true`
- [ ] Schemas validate all request/response shapes
- [ ] Connection cleanup works on disconnect

---

### Task F9: Project Health Assessment
**Dependencies**: Tasks F3, F4, F6
**Files to Create**:
- `backend/app/ai/health.py`

**Implementation Details**:

Project health is a periodic AI-computed summary that gives the user an at-a-glance view of project status. It runs when requested and can be triggered automatically after significant changes.

1. `class ProjectHealthAssessor`:
   - `async def assess(db, project_id) -> ProjectHealthSnapshot`:
     - Gather project state using `ProjectContext.assemble()`.
     - Compute health score (0-100) based on weighted factors:
       - Data availability (30%): recovery %, date range coverage, sensor redundancy.
       - QC completeness (20%): have flag rules been applied? are there unresolved anomalies?
       - Analysis completeness (25%): which standard analyses are done? are there obvious gaps?
       - Consistency (15%): do results make physical sense? (e.g., shear alpha within expected range).
       - Documentation (10%): are there project memories? have decisions been recorded?
     - Identify issues (structured list):
       ```json
       [
         {
           "severity": "critical",
           "category": "data_quality",
           "message": "Speed_80m has 12.3% icing-flagged data. Excluding changes mean speed by 1.4 m/s.",
           "suggested_action": "Review and approve icing flag."
         },
         {
           "severity": "warning",
           "category": "analysis",
           "message": "Extreme wind analysis based on 14 months data. Confidence is low.",
           "suggested_action": "Consider using regional extreme wind database."
         }
       ]
       ```
     - Compute key metrics snapshot:
       ```json
       {
         "mean_speed_80m": 6.93,
         "weibull_k": 2.14,
         "shear_alpha": 0.18,
         "ti_class": "B",
         "data_recovery_pct": 94.2,
         "mcp_applied": true,
         "lt_mean_speed": 7.12,
         "gross_aep_mwh": 8420,
         "pending_actions": 2
       }
       ```
     - Use the LLM to generate a natural-language summary (2-3 sentences).
     - Store as `project_health_snapshots` record.

**Acceptance Criteria**:
- [ ] Health score is computed from weighted factors
- [ ] Issues list identifies real problems from project state
- [ ] Metrics snapshot includes all available key results
- [ ] Natural language summary is concise and accurate
- [ ] Snapshots are stored and retrievable

---

### Task F10: Downstream Impact Estimator
**Dependencies**: Tasks F3, F4
**Files to Create**:
- `backend/app/ai/impact.py`

**Implementation Details**:

Before a user approves an action (e.g., applying a QC flag), the system should estimate how it will affect downstream results.

1. `class ImpactEstimator`:
   - `async def estimate(db, project_id, action: AiAction) -> dict`:
     - Load the current analysis results (from `analysis_results` table).
     - Simulate the action:
       - For QC flag actions: load data with and without the flag, recompute key metrics.
       - For MCP method change: recompute LT mean speed with the new method.
       - For shear extrapolation: recompute at the new height.
     - Return a structured impact summary:
       ```json
       {
         "affected_metrics": [
           {
             "metric": "mean_speed_80m",
             "current": 6.93,
             "projected": 7.06,
             "change_pct": 1.88,
             "direction": "increase"
           },
           {
             "metric": "gross_aep",
             "current": 8420,
             "projected": 8680,
             "change_pct": 3.09,
             "direction": "increase"
           }
         ],
         "data_affected_pct": 2.1,
         "confidence": "high"
       }
       ```
   
   - Impact estimation uses the actual analysis service functions (not approximations). For speed, it runs a simplified version:
     - Mean speed: just recompute the mean of the filtered data.
     - AEP: use the stored power curve and recompute with the updated mean (linear scaling approximation, unless full recompute is requested).

**Acceptance Criteria**:
- [ ] Impact estimator runs actual service functions for key metrics
- [ ] Returns structured before/after comparisons
- [ ] Works for QC flag actions, MCP changes, and shear changes
- [ ] Runs in < 5 seconds for typical datasets

---

## 7. Frontend Implementation Tasks

### Task F11: AI Store & Types
**Dependencies**: None (frontend)
**Files to Create**:
- `frontend/src/types/ai.ts`
- `frontend/src/stores/aiStore.ts`
- `frontend/src/api/ai.ts`

**Implementation Details**:

1. Define AI types in `types/ai.ts`:
   ```typescript
   export interface AiConversation {
     id: string;
     project_id: string;
     title: string;
     created_at: string;
     updated_at: string;
   }

   export interface AiMessage {
     id: string;
     conversation_id: string;
     role: "user" | "assistant" | "system" | "tool";
     content: string;
     tool_calls?: AiToolCall[];
     tool_call_id?: string;
     token_count?: number;
     created_at: string;
   }

   export interface AiToolCall {
     id: string;
     name: string;
     arguments: Record<string, unknown>;
   }

   export type AiActionStatus = "pending" | "accepted" | "rejected" | "auto_applied" | "expired";
   
   export type AiActionType =
     | "qc_recommendation"
     | "analysis_suggestion"
     | "mcp_recommendation"
     | "import_mapping"
     | "report_narrative"
     | "scenario_result"
     | "insight";

   export interface AiAction {
     id: string;
     project_id: string;
     conversation_id: string | null;
     action_type: AiActionType;
     title: string;
     description: string | null;
     reasoning: string | null;
     payload: Record<string, unknown>;
     status: AiActionStatus;
     impact_summary: AiImpactSummary | null;
     resolved_by: string | null;
     resolved_at: string | null;
     created_at: string;
   }

   export interface AiImpactSummary {
     affected_metrics: AiImpactMetric[];
     data_affected_pct: number;
     confidence: "high" | "medium" | "low";
   }

   export interface AiImpactMetric {
     metric: string;
     current: number;
     projected: number;
     change_pct: number;
     direction: "increase" | "decrease" | "unchanged";
   }

   export interface AiMemory {
     id: string;
     project_id: string;
     memory_type: string;
     content: string;
     metadata: Record<string, unknown> | null;
     created_at: string;
     updated_at: string;
   }

   export interface AiProjectHealth {
     id: string;
     project_id: string;
     health_score: number;
     summary: string;
     issues: AiHealthIssue[];
     metrics: Record<string, number | string | boolean>;
     created_at: string;
   }

   export interface AiHealthIssue {
     severity: "critical" | "warning" | "info";
     category: string;
     message: string;
     suggested_action: string;
   }

   // WebSocket message types
   export type AiWsMessage =
     | { type: "token"; content: string }
     | { type: "tool_call"; tool: string; args: Record<string, unknown> }
     | { type: "tool_result"; tool: string; result: Record<string, unknown> }
     | { type: "action_pending"; action: AiAction }
     | { type: "complete"; message_id: string }
     | { type: "error"; message: string };
   ```

2. Create AI API client in `api/ai.ts`:
   - Functions for all REST endpoints in Task F8.
   - WebSocket connection helper with reconnection logic.

3. Create AI store in `stores/aiStore.ts` (Zustand):
   ```typescript
   interface AiState {
     // Conversation state
     conversations: AiConversation[];
     activeConversationId: string | null;
     messages: AiMessage[];
     isStreaming: boolean;
     streamingContent: string;
     
     // Action state
     pendingActions: AiAction[];
     actionHistory: AiAction[];
     
     // Project health
     projectHealth: AiProjectHealth | null;
     
     // Memory
     memories: AiMemory[];
     
     // WebSocket
     wsConnected: boolean;
     
     // UI state
     isChatOpen: boolean;
     isCommandBarOpen: boolean;
     
     // Actions
     fetchConversations: (projectId: string) => Promise<void>;
     createConversation: (projectId: string) => Promise<AiConversation>;
     sendMessage: (conversationId: string, content: string) => Promise<void>;
     approveAction: (actionId: string) => Promise<void>;
     rejectAction: (actionId: string, reason?: string) => Promise<void>;
     fetchPendingActions: (projectId: string) => Promise<void>;
     fetchProjectHealth: (projectId: string) => Promise<void>;
     refreshProjectHealth: (projectId: string) => Promise<void>;
     fetchMemories: (projectId: string) => Promise<void>;
     connectWebSocket: (projectId: string, conversationId: string) => void;
     disconnectWebSocket: () => void;
     toggleChat: () => void;
     toggleCommandBar: () => void;
     clearStreamingContent: () => void;
   }
   ```

**Acceptance Criteria**:
- [ ] All AI types are defined and match backend schemas
- [ ] API client covers all AI REST endpoints
- [ ] WebSocket client handles connection, reconnection, and message parsing
- [ ] Store manages conversation, action, health, and memory state
- [ ] Store actions correctly call API client functions

---

### Task F12: Command Bar (Cmd+K)
**Dependencies**: Task F11
**Files to Create**:
- `frontend/src/components/ai/CommandBar.tsx`
- `frontend/src/App.tsx` (integrate)

**Implementation Details**:

A global command bar that opens with Cmd+K (Ctrl+K on Windows/Linux). This is the primary way users interact with the AI in the new version.

1. `CommandBar.tsx`:
   - Full-screen overlay with a centered input field (like VS Code command palette or Spotlight).
   - Input field with auto-focus and placeholder: "Ask anything about this project..."
   - Below the input, show:
     - **Quick actions** (when input is empty):
       - "Run QC review" → triggers QC agent
       - "Summarize project status" → triggers health assessment
       - "Suggest next analysis" → triggers analysis agent
       - "Compare MCP methods" → triggers MCP agent
       - "Generate report" → triggers report agent
       - "Download reference data" → triggers MCP agent for download
     - **Search results** (when typing):
       - Fuzzy match against: project names, dataset names, analysis types, quick actions.
       - Show matching items with icons and descriptions.
   - Submit action:
     - If a quick action is selected: dispatch to the appropriate agent.
     - If free text: send as a message to the active conversation (create one if none exists).
     - Open the chat panel to show the response.
   - Keyboard navigation: arrow keys to select, Enter to submit, Escape to close.
   - Register global keyboard shortcut `Ctrl+K` / `Cmd+K` in `App.tsx`.

2. Integration:
   - The command bar reads project context from `projectStore.activeProject`.
   - If no project is active, limit to project-level commands (list projects, create project).

**Acceptance Criteria**:
- [ ] Cmd+K / Ctrl+K opens the command bar
- [ ] Quick actions are displayed when input is empty
- [ ] Typing filters quick actions and shows search results
- [ ] Submitting sends a message to the AI
- [ ] Keyboard navigation works (arrows, Enter, Escape)
- [ ] Command bar closes after action is dispatched

---

### Task F13: AI Chat Panel
**Dependencies**: Task F11
**Files to Create**:
- `frontend/src/components/ai/AiChatPanel.tsx`
- `frontend/src/ai/useAiChat.ts`

**Implementation Details**:

A slide-out panel on the right side of the app shell that shows the conversational AI interaction.

1. `useAiChat.ts` hook:
   - Manages WebSocket connection for streaming.
   - `sendMessage(content: string)` — sends user message, starts streaming response.
   - `messages` — array of all messages in the current conversation.
   - `isStreaming` — whether the AI is currently responding.
   - `streamingContent` — partial text being streamed.
   - `pendingToolCalls` — tools currently being executed by the AI.
   - Handles reconnection on disconnect.

2. `AiChatPanel.tsx`:
   - Slide-out panel from the right edge, width 420px on desktop, full-width on mobile.
   - Toggle button in the app shell top bar (always visible).
   - Layout:
     - **Header**: conversation title, "New conversation" button, close button.
     - **Messages area** (scrollable):
       - User messages: right-aligned, dark background.
       - Assistant messages: left-aligned, rendered with `react-markdown` for formatting.
       - Tool call indicators: small inline cards showing "Running shear analysis..." with a spinner.
       - Tool results: collapsible summary (show key metrics, expand for full JSON).
       - Action cards: inline `ActionCard` components for pending actions (approve/reject buttons).
     - **Input area**: auto-resizing textarea, send button, loading indicator during streaming.
   - Streaming display: assistant messages update in real-time as tokens arrive.
   - Auto-scroll to bottom on new messages.

3. Message rendering:
   - Assistant text: render via `react-markdown` with `remark-gfm` for tables and task lists.
   - Math expressions: render with KaTeX (the AI may include formulas like $\alpha = \frac{\ln(v_2/v_1)}{\ln(z_2/z_1)}$).
   - Data references: if the AI mentions an analysis result, link to the relevant page/tab.

**Acceptance Criteria**:
- [ ] Chat panel slides in/out smoothly
- [ ] Messages stream in real-time via WebSocket
- [ ] Tool calls show inline indicators with status
- [ ] Markdown, tables, and math render correctly
- [ ] Action cards appear inline with approve/reject buttons
- [ ] Auto-scroll works during streaming
- [ ] New conversations can be created

---

### Task F14: Action Card & Action Timeline
**Dependencies**: Task F11
**Files to Create**:
- `frontend/src/components/ai/ActionCard.tsx`
- `frontend/src/components/ai/ActionTimeline.tsx`
- `frontend/src/ai/useAiActions.ts`

**Implementation Details**:

1. `ActionCard.tsx`:
   - Displays a single AI recommendation with:
     - **Title**: e.g., "Apply icing flag to Speed_80m"
     - **Reasoning**: AI's explanation (collapsible, 2-3 sentences).
     - **Impact summary** (if available): before/after metrics in a small table.
     - **Action buttons**: "Approve" (green), "Reject" (red with optional reason input).
     - **Status badge**: pending (amber), accepted (green), rejected (red).
   - `ActionCard` is used both inline in the chat panel and in the action timeline.

2. `ActionTimeline.tsx`:
   - A dedicated view showing all AI actions for a project in chronological order.
   - Filter tabs: All, Pending, Accepted, Rejected.
   - Each entry shows: timestamp, action type icon, title, status badge.
   - Expand to see full reasoning and impact.
   - Bulk actions: "Approve All Pending" (with confirmation).

3. `useAiActions.ts` hook:
   - `pendingActions` — filtered list of pending actions.
   - `approveAction(actionId)` — calls API, updates store.
   - `rejectAction(actionId, reason?)` — calls API, updates store.
   - `fetchActions(projectId, status?)` — loads actions.

**Acceptance Criteria**:
- [ ] Action cards display title, reasoning, impact, and action buttons
- [ ] Approve/reject calls the API and updates the UI
- [ ] Rejection supports an optional reason
- [ ] Action timeline shows chronological history
- [ ] Filter tabs work correctly
- [ ] Pending action count is shown in the app shell (badge)

---

### Task F15: Project Health Dashboard
**Dependencies**: Tasks F9 (backend), F11 (frontend)
**Files to Create**:
- `frontend/src/components/ai/ProjectHealth.tsx`
- `frontend/src/components/ai/UncertaintyStack.tsx`

**Implementation Details**:

1. `ProjectHealth.tsx`:
   - A dashboard card that appears at the top of the project workspace.
   - Shows:
     - **Health score**: circular gauge (0-100) with color (red < 40, amber 40-70, green > 70).
     - **Summary**: natural language summary (1-2 sentences).
     - **Key metrics**: compact grid of the most important numbers (mean speed, Weibull k, shear alpha, TI class, AEP, data recovery).
     - **Issues list**: severity-sorted cards with suggested actions.
     - **Refresh button**: triggers `POST /api/ai/health/{project_id}/refresh`.
   - Issues with "critical" severity have a red left border.
   - Each issue's suggested action is a clickable link that opens the relevant page/tool.

2. `UncertaintyStack.tsx`:
   - Visualization of the uncertainty breakdown for the project's energy estimate.
   - Horizontal stacked bar showing contribution of each uncertainty source:
     - Wind speed measurement uncertainty
     - Long-term adjustment uncertainty (MCP method variance)
     - Shear extrapolation uncertainty
     - Power curve uncertainty
     - Air density uncertainty
   - Clicking a segment opens a tooltip with details and the AI's assessment.
   - This is a stretch component — initially it can display a static breakdown from the energy estimate results. In future, the AI can compute dynamic uncertainty.

**Acceptance Criteria**:
- [ ] Health score gauge renders correctly
- [ ] Summary text is displayed
- [ ] Key metrics grid shows available values, "—" for missing
- [ ] Issues list renders with severity colors
- [ ] Refresh triggers a new health assessment
- [ ] Component handles missing/partial data gracefully

---

### Task F16: Unified Workspace Page
**Dependencies**: Tasks F12, F13, F14, F15
**Files to Create**:
- `frontend/src/pages/WorkspacePage.tsx`
- `frontend/src/components/workspace/WorkspaceCanvas.tsx`
- `frontend/src/components/workspace/DataArrivalPanel.tsx`
- `frontend/src/components/workspace/IssueTracker.tsx`
- `frontend/src/components/workspace/ScenarioManager.tsx`

**Implementation Details**:

The unified workspace page is the new home for a project. It replaces the need to navigate between separate pages for most tasks.

1. `WorkspacePage.tsx`:
   - Route: `/workspace/:projectId`
   - Three-column layout on desktop:
     - **Left column (30%)**: Project map (existing `ProjectMap` component), dataset inventory, data arrival notifications.
     - **Center column (45%)**: Tabbed workspace showing the current analysis/view, issue tracker, scenario manager.
     - **Right column (25%)**: AI chat panel (integrated, not overlay).
   - On mobile/tablet: single column with bottom tab navigation.

2. `WorkspaceCanvas.tsx`:
   - The center column manager.
   - Tabs at the top: "Overview" | "Analysis" | "QC" | "MCP" | "Energy" | "Timeline"
   - "Overview" tab shows:
     - `ProjectHealth` component.
     - Recent activity feed (last 10 changes from `change_logs`).
     - `IssueTracker` (unresolved anomalies and pending actions).
   - Other tabs embed the existing page components (`AnalysisPage`, `QCPage`, `MCPPage`, `EnergyPage`) but within the workspace layout instead of as standalone pages.
   - The workspace passes the project/dataset context down so these embedded pages don't need their own selectors.

3. `DataArrivalPanel.tsx`:
   - Shows when new files are uploaded or new reference data is downloaded.
   - Displays the import agent's interpretation:
     - "New file detected: met_tower_march_2026.csv"
     - "Detected: 6 speed channels (40m, 60m, 80m), 3 direction channels, temperature, pressure"
     - "3 questions need your input" (link to clarification cards).

4. `IssueTracker.tsx`:
   - Lists all unresolved items:
     - Pending AI actions awaiting approval.
     - QC anomalies detected but not yet flagged.
     - Analysis gaps (e.g., "Turbulence analysis not yet run").
     - Data quality warnings (e.g., "Low recovery in August 2025: 72%").
   - Each issue has a severity badge and an action button.

5. `ScenarioManager.tsx`:
   - Displays energy scenarios side-by-side.
   - Each scenario is a column showing: hub height, power curve, MCP method, AEP, capacity factor.
   - "Add Scenario" button opens a quick-config form.
   - "Compare" highlights differences between scenarios.

6. Routing update in `App.tsx`:
   - Add route: `/workspace/:projectId` → `WorkspacePage`.
   - Keep all existing routes functional.
   - `DashboardPage` project cards link to `/workspace/:projectId` instead of `/project/:projectId`.
   - `/project/:projectId` continues to work (redirects to workspace or remains as legacy view).

**Acceptance Criteria**:
- [ ] Three-column layout renders correctly on desktop
- [ ] Left column shows map and dataset inventory
- [ ] Center column tabs switch between views
- [ ] Overview tab shows health, activity, and issues
- [ ] Existing analysis/QC/MCP components embed correctly within tabs
- [ ] AI chat panel is integrated in the right column
- [ ] DataArrivalPanel shows import interpretations
- [ ] IssueTracker aggregates pending items
- [ ] ScenarioManager displays side-by-side energy comparisons
- [ ] Routing works correctly with new and existing routes

---

### Task F17: Insight Banners & Contextual AI
**Dependencies**: Tasks F11, F13
**Files to Create**:
- `frontend/src/components/ai/InsightBanner.tsx`
- `frontend/src/ai/AiProvider.tsx`

**Implementation Details**:

Contextual AI insights that appear as non-intrusive banners within existing pages when the AI detects something noteworthy.

1. `AiProvider.tsx`:
   - A React context provider that wraps the entire app.
   - Provides: AI connection status, active project health, pending action count, insight queue.
   - On project change: fetches pending actions and latest health snapshot.
   - Exposes `showInsight(insight: AiHealthIssue)` for components to trigger insight banners.

2. `InsightBanner.tsx`:
   - A dismissible banner that appears at the top of a page/section.
   - Variants by severity:
     - `critical`: red background, alert icon.
     - `warning`: amber background, warning icon.
     - `info`: blue background, info icon.
   - Content: message text + "Take Action" button (opens relevant tool or chat).
   - Auto-dismiss after 30 seconds for `info` severity, persistent for `critical`.

3. Integration points (modify existing pages):
   - `AnalysisPage.tsx`: After running an analysis, check if the AI has insights about the result (e.g., "Shear alpha is unusually high"). Show as an `InsightBanner`.
   - `QCPage.tsx`: After applying rules, show a banner with the downstream impact summary.
   - `MCPPage.tsx`: After running MCP comparison, show a banner with the AI's method recommendation.
   - `ImportPage.tsx`: After upload, show a banner if the import agent detected potential issues.

**Acceptance Criteria**:
- [ ] `AiProvider` wraps the app and provides AI context
- [ ] Insight banners render with correct severity styling
- [ ] Banners are dismissible
- [ ] Integration points in existing pages show contextual insights
- [ ] Pending action count is available app-wide

---

### Task F18: AI Enhancement of Existing Pages
**Dependencies**: Tasks F11, F13, F14, F17
**Files to Modify** (not create):
- `frontend/src/pages/ImportPage.tsx`
- `frontend/src/pages/QCPage.tsx`
- `frontend/src/pages/AnalysisPage.tsx`
- `frontend/src/pages/MCPPage.tsx`
- `frontend/src/pages/EnergyPage.tsx`
- `frontend/src/pages/ExportPage.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/TopBar.tsx`

**Implementation Details**:

These are targeted, minimal modifications to existing pages to integrate AI features. The existing functionality must not be broken.

1. **AppShell.tsx** modifications:
   - Add `AiProvider` wrapper around the entire app shell.
   - Add AI chat toggle button in the top bar (right side).
   - Add pending action count badge in the sidebar next to relevant pages.
   - Register Cmd+K keyboard shortcut.

2. **TopBar.tsx** modifications:
   - Add AI status indicator (green dot when connected, grey when disconnected).
   - Add chat toggle button (message icon with unread count badge).
   - Add command bar trigger button (search icon).

3. **ImportPage.tsx** additions:
   - After file upload (step 2, column mapper), add an "AI Suggest" button that calls the import agent to review the detected columns.
   - Show import agent suggestions as inline notes next to each column row.
   - "Accept All AI Suggestions" button to apply mapping corrections.

4. **QCPage.tsx** additions:
   - Add "AI Review" button in the QC toolbar that triggers the QC agent.
   - QC agent results appear as suggested flags in the flag manager (marked with an AI badge).
   - Each AI-suggested flag shows impact summary before applying.

5. **AnalysisPage.tsx** additions:
   - Add "Interpret Results" button next to each analysis tab's results.
   - Clicking sends the current analysis results to the analysis agent.
   - Agent response appears as an insight banner or in the chat panel.
   - Add "Suggest Next" button that asks the analysis agent what analysis to run next.

6. **MCPPage.tsx** additions:
   - Add "AI Recommend" button in the method comparison section.
   - MCP agent explains the tradeoffs between methods in a panel below the comparison table.
   - Highlight the AI-recommended method with a badge.

7. **EnergyPage.tsx** additions:
   - Add "Run Scenarios" button that opens the scenario manager.
   - Energy agent can populate scenario parameters based on the user's intent.

8. **ExportPage.tsx** additions:
   - Add "AI Narrative" option in the report generator.
   - When enabled, the report agent generates text for each section.
   - Preview shows the AI-generated narrative inline.

**Acceptance Criteria**:
- [ ] All existing page functionality continues to work exactly as before
- [ ] AI buttons are clearly labeled and optional (users can ignore them)
- [ ] Import agent suggestions appear inline in the column mapper
- [ ] QC agent suggestions appear as AI-badged flags
- [ ] Analysis interpretation opens in the chat panel
- [ ] MCP recommendation is displayed with reasoning
- [ ] Energy scenarios can be AI-populated
- [ ] Report narrative can be AI-generated
- [ ] AI features degrade gracefully when `AI_ENABLED=false` (buttons hidden)

---

## 8. Migration & Compatibility

### 8.1 Database Migration

- Create migration `20260402_0005_ai_tables.py` that adds all new tables.
- Existing tables are not modified.
- Migration is forward-only safe: existing data is not affected.
- `alembic upgrade head` from the activated `gokaatru` environment adds the new tables.

### 8.2 API Compatibility

- All existing REST endpoints at `/api/projects`, `/api/datasets`, `/api/import`, `/api/qc`, `/api/analysis`, `/api/mcp`, `/api/export`, `/api/reports`, `/api/workflows` remain unchanged.
- New AI endpoints are under `/api/ai/*` as a separate router.
- When `AI_ENABLED=false`, the `/api/ai` router is not registered. The application behaves exactly like v1.

### 8.3 Frontend Compatibility

- All existing pages remain at their current routes.
- The new `WorkspacePage` is an additional route (`/workspace/:projectId`).
- The `DashboardPage` links to the workspace for each project, but the old `/project/:projectId` route still works.
- The AI chat panel, command bar, and insight banners are conditional on `AI_ENABLED` being true (read from a `/api/ai/status` endpoint or a frontend env var `VITE_AI_ENABLED`).

### 8.4 Configuration Backward Compatibility

- If no `LLM_API_KEY` is set, `AI_ENABLED` defaults to `false`.
- All new environment variables have sensible defaults.
- The application starts and functions without any AI configuration.

---

## 9. Testing Strategy

### 9.1 Backend Tests

**New test files**:
- `backend/tests/test_ai_client.py` — mock LLM, test chat completion, streaming, token counting.
- `backend/tests/test_ai_tools.py` — test each tool definition maps to the correct service function, validates args.
- `backend/tests/test_ai_context.py` — test context assembly with various project states (empty, partial, full).
- `backend/tests/test_ai_orchestrator.py` — mock LLM, test tool dispatch loop, action creation, approval/rejection.
- `backend/tests/test_ai_agents.py` — mock LLM, test each agent's tool selection and recommendation format.
- `backend/tests/test_ai_memory.py` — test memory CRUD, automatic memory creation on action approval.
- `backend/tests/test_ai_provenance.py` — test hash computation, verification, diff.
- `backend/tests/test_ai_health.py` — test health scoring with known project states.
- `backend/tests/test_ai_impact.py` — test impact estimation for QC flag actions.
- `backend/tests/test_ai_router.py` — test all REST endpoints and WebSocket connection.

**Testing approach**:
- All tests must mock the LLM provider (no real API calls in tests).
- Use `httpx.AsyncClient` for API endpoint tests.
- Use a test database (same as existing tests in `conftest.py`).
- Seed test data using the existing demo seed pattern.

### 9.2 Frontend Tests

**New test files**:
- `frontend/src/components/ai/CommandBar.test.tsx` — test keyboard shortcut, quick actions, search filtering.
- `frontend/src/components/ai/AiChatPanel.test.tsx` — test message rendering, streaming, tool call display.
- `frontend/src/components/ai/ActionCard.test.tsx` — test approve/reject flows.
- `frontend/src/components/ai/ProjectHealth.test.tsx` — test health score rendering, issue display.
- `frontend/src/stores/aiStore.test.ts` — test store actions and state management.

**Testing approach**:
- Use Vitest (existing test framework).
- Mock API calls with `vi.mock`.
- Mock WebSocket with a test helper.
- Test that AI features are hidden when `AI_ENABLED=false`.

### 9.3 Existing Tests

- All existing backend tests in `backend/tests/` must continue to pass unchanged.
- All existing frontend tests must continue to pass unchanged.
- Run the full test suite before and after each task to verify no regressions.

---

## 10. Deployment Changes

### 10.1 Docker Compose Updates

Add to `docker-compose.yml`:
```yaml
services:
  backend:
    environment:
      - LLM_PROVIDER=${LLM_PROVIDER:-openai}
      - LLM_API_KEY=${LLM_API_KEY:-}
      - LLM_MODEL=${LLM_MODEL:-gpt-4o}
      - LLM_BASE_URL=${LLM_BASE_URL:-}
      - AI_ENABLED=${AI_ENABLED:-true}
      - AI_MAX_TOKENS_PER_REQUEST=${AI_MAX_TOKENS_PER_REQUEST:-4096}
      - AI_CONTEXT_WINDOW=${AI_CONTEXT_WINDOW:-128000}
```

### 10.2 Backend Dockerfile Updates

Add to `backend/Dockerfile` (pip install section):
```dockerfile
# litellm and tiktoken for AI features
RUN pip install litellm tiktoken
```

Or preferably, add `litellm` and `tiktoken` to `backend/pyproject.toml` as optional dependencies under an `[ai]` extra:
```toml
[project.optional-dependencies]
ai = ["litellm>=1.40", "tiktoken>=0.7"]
```

### 10.3 Frontend Build Updates

Add to `frontend/package.json` dependencies:
```json
{
  "react-markdown": "^9.0",
  "remark-gfm": "^4.0",
  "katex": "^0.16",
  "react-katex": "^3.0"
}
```

### 10.4 Nginx Configuration

Add WebSocket proxy to `nginx.conf`:
```nginx
location /api/ai/ws/ {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

## Appendix A: Task Dependency Graph

```
F1  LLM Client
 └─► F2  Tool Definitions
      └─► F3  Context Assembly
           └─► F4  Orchestrator & Action Executor
                ├─► F5  Domain Agents (import, qc, analysis, mcp, energy, report)
                ├─► F6  Project Memory
                ├─► F7  Provenance Tracking
                ├─► F8  API Router & WebSocket
                ├─► F9  Health Assessment
                └─► F10 Impact Estimator

F11 AI Store & Types (frontend, no backend dependency)
 ├─► F12 Command Bar
 ├─► F13 Chat Panel
 ├─► F14 Action Card & Timeline
 ├─► F15 Project Health Dashboard (needs F9 on backend)
 ├─► F16 Workspace Page (needs F12, F13, F14, F15)
 ├─► F17 Insight Banners
 └─► F18 AI Enhancement of Existing Pages (needs F17)
```

Backend tasks F1→F4 are the critical path. Frontend task F11 can start in parallel.

## Appendix B: Environment Setup for AI Development

### Backend

```powershell
# From the repository root, in PowerShell:
. "C:\ProgramData\anaconda3\shell\condabin\conda-hook.ps1"
conda activate gokaatru

# Install AI dependencies
cd backend
pip install -e ".[ai]"

# Set up the LLM key (use your own key)
$env:LLM_API_KEY = "sk-..."
$env:LLM_MODEL = "gpt-4o"

# Run migrations for AI tables
alembic upgrade head

# Start the backend
uvicorn app.main:app --reload
```

### Frontend

```powershell
cd frontend
npm install    # installs new AI dependencies from package.json
npm run dev
```

## Appendix C: AI Action Payload Schema Reference

Each `ai_actions.payload` has a different schema depending on `action_type`:

### `qc_recommendation`
```json
{
  "dataset_id": "uuid",
  "flag_name": "Icing Detection",
  "flag_color": "#3b82f6",
  "rules": [
    { "column_name": "Temp_2m", "operator": "<", "value": 2 },
    { "column_name": "Speed_SD_80m", "operator": "==", "value": 0 }
  ],
  "estimated_flagged_pct": 2.1,
  "reasoning": "Temperature drops below 2°C coincide with zero wind speed standard deviation, indicating sensor icing."
}
```

### `analysis_suggestion`
```json
{
  "analysis_type": "shear",
  "dataset_id": "uuid",
  "parameters": {
    "speed_columns": ["Speed_40m", "Speed_60m", "Speed_80m"],
    "direction_column": "Dir_80m",
    "method": "power",
    "target_height": 120
  },
  "reasoning": "Three measurement heights are available. Computing shear profile will enable extrapolation to the target hub height of 120m."
}
```

### `mcp_recommendation`
```json
{
  "recommended_method": "variance_ratio",
  "site_dataset_id": "uuid",
  "site_column": "Speed_80m",
  "reference_dataset_id": "uuid",
  "reference_column": "WS_100m",
  "comparison_results": {
    "linear": { "r2": 0.82, "rmse_cv": 1.24 },
    "variance_ratio": { "r2": 0.82, "rmse_cv": 0.98 },
    "matrix": { "r2": 0.85, "rmse_cv": 1.05 }
  },
  "reasoning": "Variance ratio has the lowest cross-validation RMSE (0.98 m/s) despite similar R² to linear. Matrix method slightly overfits (CV RMSE 1.05 vs train R² 0.85)."
}
```

### `scenario_result`
```json
{
  "scenarios": [
    {
      "name": "Base Case (80m)",
      "hub_height": 80,
      "power_curve_id": "uuid",
      "mcp_method": "variance_ratio",
      "density_adjusted": true,
      "gross_aep_mwh": 8420,
      "capacity_factor": 0.32
    },
    {
      "name": "120m Hub Height",
      "hub_height": 120,
      "power_curve_id": "uuid",
      "mcp_method": "variance_ratio",
      "density_adjusted": true,
      "gross_aep_mwh": 9850,
      "capacity_factor": 0.37
    }
  ]
}
```

### `import_mapping`
```json
{
  "dataset_name": "Met Mast Alpha",
  "column_corrections": [
    {
      "column_index": 3,
      "original_type": "other",
      "suggested_type": "speed_sd",
      "original_height": null,
      "suggested_height": 80,
      "confidence": 0.92,
      "reasoning": "Column name 'Ch3SD' matches NRG standard deviation naming. Height inferred from adjacent speed channel."
    }
  ]
}
```

### `report_narrative`
```json
{
  "section_id": "executive_summary",
  "narrative_text": "The GoKaatru Demo Project site, located at 40.01°N, -105.27°W at an elevation of 1655 metres, demonstrates a moderate wind resource with a long-term predicted mean wind speed of 7.12 m/s at 80 metres...",
  "tone": "technical_due_diligence"
}
```

### `insight`
```json
{
  "category": "data_quality",
  "severity": "warning",
  "message": "Speed_60m and Speed_80m show decorrelation after March 15, 2025. This may indicate a sensor replacement or boom realignment.",
  "evidence": {
    "correlation_before": 0.97,
    "correlation_after": 0.84,
    "change_date": "2025-03-15"
  }
}
```

---

## Appendix D: File Summary — All New Files

### Backend (24 new files)
| File | Purpose |
|---|---|
| `backend/app/ai/__init__.py` | Package init |
| `backend/app/ai/llm_client.py` | LLM API client (litellm wrapper) |
| `backend/app/ai/tools.py` | Function-calling tool definitions |
| `backend/app/ai/context.py` | Project context assembly |
| `backend/app/ai/orchestrator.py` | Central AI reasoning loop |
| `backend/app/ai/action_executor.py` | Maps actions to service functions |
| `backend/app/ai/memory.py` | Project memory CRUD |
| `backend/app/ai/provenance.py` | Analysis provenance tracking |
| `backend/app/ai/health.py` | Project health assessment |
| `backend/app/ai/impact.py` | Downstream impact estimation |
| `backend/app/ai/router.py` | `/api/ai/*` REST + WebSocket endpoints |
| `backend/app/ai/websocket_hub.py` | WebSocket connection management |
| `backend/app/ai/agents/__init__.py` | Agents package init |
| `backend/app/ai/agents/base.py` | Abstract agent class |
| `backend/app/ai/agents/import_agent.py` | Import interpretation agent |
| `backend/app/ai/agents/qc_agent.py` | QC anomaly detection agent |
| `backend/app/ai/agents/analysis_agent.py` | Analysis recommendation agent |
| `backend/app/ai/agents/mcp_agent.py` | MCP method recommendation agent |
| `backend/app/ai/agents/energy_agent.py` | Energy scenario agent |
| `backend/app/ai/agents/report_agent.py` | Report narrative agent |
| `backend/app/ai/prompts/orchestrator.md` | Main orchestrator system prompt |
| `backend/app/ai/prompts/qc_agent.md` | QC agent domain prompt |
| `backend/app/ai/prompts/analysis_agent.md` | Analysis agent domain prompt |
| `backend/app/ai/prompts/mcp_agent.md` | MCP agent domain prompt |
| `backend/app/ai/prompts/energy_agent.md` | Energy agent domain prompt |
| `backend/app/ai/prompts/report_agent.md` | Report agent domain prompt |
| `backend/app/ai/prompts/import_agent.md` | Import agent domain prompt |
| `backend/app/schemas/ai.py` | AI Pydantic schemas |
| `backend/app/models/ai.py` | AI SQLAlchemy models (5 tables) |
| `backend/alembic/versions/20260402_0005_ai_tables.py` | Migration for AI tables |

### Backend Tests (10 new files)
| File | Purpose |
|---|---|
| `backend/tests/test_ai_client.py` | LLM client tests (mocked) |
| `backend/tests/test_ai_tools.py` | Tool schema validation tests |
| `backend/tests/test_ai_context.py` | Context assembly tests |
| `backend/tests/test_ai_orchestrator.py` | Orchestrator loop tests |
| `backend/tests/test_ai_agents.py` | Agent tests (mocked LLM) |
| `backend/tests/test_ai_memory.py` | Memory CRUD tests |
| `backend/tests/test_ai_provenance.py` | Provenance tests |
| `backend/tests/test_ai_health.py` | Health assessment tests |
| `backend/tests/test_ai_impact.py` | Impact estimation tests |
| `backend/tests/test_ai_router.py` | API endpoint tests |

### Frontend (16 new files)
| File | Purpose |
|---|---|
| `frontend/src/types/ai.ts` | AI TypeScript types |
| `frontend/src/api/ai.ts` | AI API client |
| `frontend/src/stores/aiStore.ts` | AI Zustand store |
| `frontend/src/ai/AiProvider.tsx` | AI React context provider |
| `frontend/src/ai/useAiChat.ts` | Chat hook (WebSocket) |
| `frontend/src/ai/useAiActions.ts` | Action management hook |
| `frontend/src/ai/aiClient.ts` | WebSocket wrapper |
| `frontend/src/components/ai/CommandBar.tsx` | Global command palette |
| `frontend/src/components/ai/AiChatPanel.tsx` | Chat panel |
| `frontend/src/components/ai/ActionCard.tsx` | Single action card |
| `frontend/src/components/ai/ActionTimeline.tsx` | Action history timeline |
| `frontend/src/components/ai/InsightBanner.tsx` | Contextual insight banner |
| `frontend/src/components/ai/ProjectHealth.tsx` | Health dashboard |
| `frontend/src/components/ai/UncertaintyStack.tsx` | Uncertainty visualization |
| `frontend/src/pages/WorkspacePage.tsx` | Unified project workspace |
| `frontend/src/components/workspace/WorkspaceCanvas.tsx` | Workspace center panel |
| `frontend/src/components/workspace/DataArrivalPanel.tsx` | Import notification panel |
| `frontend/src/components/workspace/IssueTracker.tsx` | Issue aggregation panel |
| `frontend/src/components/workspace/ScenarioManager.tsx` | Energy scenario comparison |

### Frontend Tests (5 new files)
| File | Purpose |
|---|---|
| `frontend/src/components/ai/CommandBar.test.tsx` | Command bar tests |
| `frontend/src/components/ai/AiChatPanel.test.tsx` | Chat panel tests |
| `frontend/src/components/ai/ActionCard.test.tsx` | Action card tests |
| `frontend/src/components/ai/ProjectHealth.test.tsx` | Health dashboard tests |
| `frontend/src/stores/aiStore.test.ts` | AI store tests |

### Modified Existing Files (8 files — minimal changes only)
| File | Change |
|---|---|
| `backend/app/config.py` | Add AI settings fields |
| `backend/app/main.py` | Conditionally register AI router |
| `frontend/src/App.tsx` | Add AiProvider wrapper, Cmd+K shortcut, workspace route |
| `frontend/src/components/layout/AppShell.tsx` | Add chat toggle, pending action badge |
| `frontend/src/components/layout/TopBar.tsx` | Add AI status indicator, chat button |
| `frontend/src/pages/ImportPage.tsx` | Add "AI Suggest" button in column mapper |
| `frontend/src/pages/QCPage.tsx` | Add "AI Review" button |
| `frontend/src/pages/AnalysisPage.tsx` | Add "Interpret Results" button |
| `frontend/src/pages/MCPPage.tsx` | Add "AI Recommend" button |
| `frontend/src/pages/EnergyPage.tsx` | Add "Run Scenarios" button |
| `frontend/src/pages/ExportPage.tsx` | Add "AI Narrative" option |
| `docker-compose.yml` | Add AI environment variables |
| `nginx.conf` | Add WebSocket proxy rule |
| `backend/pyproject.toml` | Add AI optional dependencies |
| `frontend/package.json` | Add react-markdown, katex dependencies |

**Total: ~55 new files, ~14 modified files.**

---

*End of Future Version Specification. This document provides sufficient detail for an AI coding agent to implement GoKaatru v2 incrementally, task by task, without breaking the existing v1 application.*
