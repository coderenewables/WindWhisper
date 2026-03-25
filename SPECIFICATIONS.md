# WindWhisper — Wind Resource Analysis Platform
## Master Project Specification & Incremental Task List

**Repository**: `coderenewables/wind-resource`  
**License**: Apache 2.0  
**Version**: 1.0 (March 2026)  
**Purpose**: A comprehensive, open-source web application for wind resource assessment rivaling Windographer by UL Solutions.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Feature Mapping](#4-feature-mapping-windographer-to-WindWhisper)
5. [Development Phases](#5-development-phases)
6. [Incremental Daily Tasks](#6-incremental-daily-tasks)

---

## 1. Project Overview

### 1.1 Goals
Build an open-source, web-based wind data analysis platform ("WindWhisper") that covers the full wind resource assessment (WRA) workflow:

- **Import** raw data from meteorological towers, LiDAR, SoDAR, CSV/Excel, and reanalysis datasets (ERA5, MERRA-2)
- **Validate & QC** data with automated flagging rules and manual annotation
- **Analyze** wind shear, turbulence intensity, air density, Weibull fits, extreme wind, and energy estimates
- **Long-Term Adjust** short-term measurements using MCP (Measure-Correlate-Predict) with multiple algorithms
- **Visualize** time series, wind roses, frequency histograms, scatterplots, daily/monthly profiles
- **Report** results as downloadable PDF/Word documents
- **Export** cleaned data in WAsP TAB, CSV, IEA Task 43 JSON, and other industry formats

### 1.2 Scope
The application is a full-stack web app. One backend server handles computation; one frontend serves the interactive UI. A PostgreSQL database stores projects, datasets, and metadata. Heavy computation (MCP, shear extrapolation) runs server-side in Python. All visualizations render client-side using React + charting libraries.

### 1.3 Non-Goals (v1)
- Real-time streaming telemetry ingestion
- Full micrositing / spatial wind flow modeling (WAsP-level CFD)
- Mobile-native apps
- Multi-tenant SaaS billing

---

## 2. Technical Architecture

### 2.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  (Vite + React 18 + TypeScript + TailwindCSS)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │TimeSeries│ │ WindRose │ │Histogram │ │ MCP Module │ │
│  │  Chart   │ │  Chart   │ │  Chart   │ │   UI       │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  Recharts · Plotly.js · D3.js                           │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API (JSON)
                        │ WebSocket (progress/streaming)
┌───────────────────────┴─────────────────────────────────┐
│                  FastAPI Backend (Python 3.11+)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │  Import  │ │   QC &   │ │ Analysis │ │  Export &  │ │
│  │  Engine  │ │ Flagging │ │  Engine  │ │  Reports   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  pandas · numpy · scipy · matplotlib · windrose         │
└───────────────────────┬─────────────────────────────────┘
                        │ SQLAlchemy ORM
┌───────────────────────┴─────────────────────────────────┐
│              PostgreSQL 15 + TimescaleDB                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ Projects │ │ Datasets │ │TimeSeries│                │
│  │  Table   │ │ Metadata │ │  Hyper   │                │
│  └──────────┘ └──────────┘ └──────────┘                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Folder Structure

```
wind-resource/
├── LICENSE
├── README.md
├── WINDOGRAPHER_RIVAL_SPEC.md          # This file
├── docker-compose.yml                  # PostgreSQL + app services
├── .env.example
│
├── backend/
│   ├── pyproject.toml                  # Python deps (Poetry / pip)
│   ├── alembic/                        # DB migrations
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI app entry
│   │   ├── config.py                   # Settings / env vars
│   │   ├── database.py                 # SQLAlchemy engine + session
│   │   ├── models/                     # ORM models
│   │   │   ├── __init__.py
│   │   │   ├── project.py
│   │   │   ├── dataset.py
│   │   │   ├── timeseries.py
│   │   │   ├── flag.py
│   │   │   └── analysis_result.py
│   │   ├── schemas/                    # Pydantic request/response
│   │   │   ├── __init__.py
│   │   │   ├── project.py
│   │   │   ├── dataset.py
│   │   │   ├── timeseries.py
│   │   │   └── analysis.py
│   │   ├── api/                        # Route handlers
│   │   │   ├── __init__.py
│   │   │   ├── projects.py
│   │   │   ├── datasets.py
│   │   │   ├── import_engine.py
│   │   │   ├── qc.py
│   │   │   ├── analysis.py
│   │   │   ├── mcp.py
│   │   │   ├── export.py
│   │   │   └── reports.py
│   │   ├── services/                   # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── file_parsers/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── csv_parser.py
│   │   │   │   ├── excel_parser.py
│   │   │   │   ├── nrg_parser.py
│   │   │   │   ├── campbell_parser.py
│   │   │   │   └── auto_detect.py
│   │   │   ├── qc_engine.py
│   │   │   ├── wind_shear.py
│   │   │   ├── turbulence.py
│   │   │   ├── air_density.py
│   │   │   ├── weibull.py
│   │   │   ├── extreme_wind.py
│   │   │   ├── mcp_engine.py
│   │   │   ├── data_reconstruction.py
│   │   │   ├── energy_estimate.py
│   │   │   ├── export_engine.py
│   │   │   └── report_generator.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── time_helpers.py
│   │       └── statistics.py
│   └── tests/
│       ├── conftest.py
│       ├── test_import.py
│       ├── test_qc.py
│       ├── test_analysis.py
│       └── test_mcp.py
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── index.html
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                        # Axios clients
│       │   ├── client.ts
│       │   ├── projects.ts
│       │   ├── datasets.ts
│       │   ├── analysis.ts
│       │   └── export.ts
│       ├── stores/                     # Zustand state management
│       │   ├── projectStore.ts
│       │   ├── datasetStore.ts
│       │   └── uiStore.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── TopBar.tsx
│       │   ├── projects/
│       │   │   ├── ProjectList.tsx
│       │   │   └── ProjectCard.tsx
│       │   ├── import/
│       │   │   ├── FileUploader.tsx
│       │   │   ├── ColumnMapper.tsx
│       │   │   └── ImportPreview.tsx
│       │   ├── timeseries/
│       │   │   ├── TimeSeriesChart.tsx
│       │   │   ├── TimeSeriesControls.tsx
│       │   │   └── ChannelSelector.tsx
│       │   ├── qc/
│       │   │   ├── FlagManager.tsx
│       │   │   ├── FlagRuleEditor.tsx
│       │   │   └── QCDashboard.tsx
│       │   ├── analysis/
│       │   │   ├── WindRoseChart.tsx
│       │   │   ├── FrequencyHistogram.tsx
│       │   │   ├── WeibullOverlay.tsx
│       │   │   ├── WindShearPanel.tsx
│       │   │   ├── TurbulencePanel.tsx
│       │   │   ├── AirDensityPanel.tsx
│       │   │   ├── ExtremeWindPanel.tsx
│       │   │   └── ScatterPlot.tsx
│       │   ├── mcp/
│       │   │   ├── MCPWorkspace.tsx
│       │   │   ├── ReferenceDataSelector.tsx
│       │   │   ├── CorrelationChart.tsx
│       │   │   └── LTAResultsTable.tsx
│       │   ├── energy/
│       │   │   ├── PowerCurveEditor.tsx
│       │   │   └── EnergyEstimatePanel.tsx
│       │   ├── export/
│       │   │   ├── ExportWizard.tsx
│       │   │   └── ReportGenerator.tsx
│       │   └── common/
│       │       ├── DataTable.tsx
│       │       ├── LoadingSpinner.tsx
│       │       ├── Modal.tsx
│       │       └── Tooltip.tsx
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── ProjectPage.tsx
│       │   ├── ImportPage.tsx
│       │   ├── TimeSeriesPage.tsx
│       │   ├── QCPage.tsx
│       │   ├── AnalysisPage.tsx
│       │   ├── MCPPage.tsx
│       │   ├── EnergyPage.tsx
│       │   └── ExportPage.tsx
│       ├── hooks/
│       │   ├── useTimeSeries.ts
│       │   ├── useAnalysis.ts
│       │   └── useWebSocket.ts
│       └── types/
│           ├── project.ts
│           ├── dataset.ts
│           ├── timeseries.ts
│           └── analysis.ts
│
├── data/                               # Sample data for dev/testing
│   ├── sample_met_tower.csv
│   ├── sample_lidar.csv
│   └── sample_era5.csv
│
└── docs/
    └── api.md
```

### 2.3 Database Schema (Core Tables)

```sql
-- Projects: top-level container (like a Windographer workbook)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    elevation DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Datasets: one per imported file (met tower, LiDAR, reference, etc.)
CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50),          -- 'met_tower', 'lidar', 'sodar', 'reanalysis', 'scada'
    file_name VARCHAR(500),
    time_step_seconds INTEGER,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    metadata JSONB,                    -- sensor heights, calibration, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Data columns: describes each channel in a dataset
CREATE TABLE data_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50),
    measurement_type VARCHAR(50),      -- 'speed', 'direction', 'temperature', 'pressure', 'speed_sd', etc.
    height_m DOUBLE PRECISION,
    sensor_info JSONB
);

-- Time-series records (hypertable if TimescaleDB is used)
CREATE TABLE timeseries_data (
    id BIGSERIAL,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    values JSONB NOT NULL              -- { "col_id_1": 7.2, "col_id_2": 210, ... }
);
-- CREATE INDEX ON timeseries_data (dataset_id, timestamp);

-- QC Flags
CREATE TABLE flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,        -- 'icing', 'tower_shadow', 'sensor_fault', 'manual_exclusion'
    color VARCHAR(7),                  -- hex color for display
    description TEXT
);

CREATE TABLE flag_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID REFERENCES flags(id) ON DELETE CASCADE,
    rule_json JSONB NOT NULL           -- { "column": "speed_sd_40m", "operator": "==", "value": 0 }
);

CREATE TABLE flagged_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID REFERENCES flags(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    applied_by VARCHAR(20) DEFAULT 'auto',  -- 'auto' or 'manual'
    column_ids UUID[]                  -- which columns affected, NULL = all
);

-- Analysis results (cached calculations)
CREATE TABLE analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL, -- 'weibull', 'shear', 'turbulence', 'mcp', 'extreme_wind', 'energy'
    parameters JSONB,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. Technology Stack

### 3.1 Backend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | FastAPI 0.110+ | Async REST API, WebSocket support |
| Python | 3.11+ | Runtime |
| ORM | SQLAlchemy 2.0 + Alembic | Models, migrations |
| Data processing | pandas 2.x, numpy 1.26+ | Tabular data manipulation |
| Statistics | scipy 1.12+ | Weibull fitting, regression, distributions |
| Plotting (server) | matplotlib 3.8+, windrose | Server-side chart generation for reports |
| ML | scikit-learn 1.4+ | KNN data reconstruction |
| File parsing | openpyxl, python-pptx | Excel import |
| Report gen | python-docx, WeasyPrint | Word / PDF report generation |
| Reanalysis data | cdsapi (ERA5), xarray, netCDF4 | Download ERA5/MERRA-2 reference data |
| Task queue | Celery + Redis (or background tasks) | Long-running computations |
| Testing | pytest, httpx | Unit + integration tests |

### 3.2 Frontend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React 18 + TypeScript | SPA |
| Build | Vite 5 | Fast dev server & build |
| Styling | TailwindCSS 3 + shadcn/ui | Utility-first CSS + component library |
| Charts | Recharts, Plotly.js | General charts, interactive time series |
| Wind rose | Custom D3.js component | Polar wind rose chart |
| State | Zustand | Lightweight global state |
| HTTP | Axios | API calls |
| Tables | TanStack Table | Data tables with sorting/filtering |
| File upload | react-dropzone | Drag-and-drop file import |
| Forms | React Hook Form + Zod | Validated forms |

### 3.3 Infrastructure
| Component | Technology |
|-----------|-----------|
| Database | PostgreSQL 15 (optionally + TimescaleDB) |
| Cache / Queue | Redis |
| Containerization | Docker + docker-compose |
| CI/CD | GitHub Actions |

---

## 4. Feature Mapping: Windographer → WindWhisper

| # | Windographer Feature | WindWhisper Task(s) | Priority |
|---|---------------------|-------------------|----------|
| F1 | Multi-format file import (CSV, Excel, NRG, Campbell, LiDAR) | Tasks 4–6 | High |
| F2 | Auto-detect data structure (columns, heights, time step) | Task 5 | High |
| F3 | Multi-dataset project / workbook | Tasks 3, 7 | High |
| F4 | Interactive scrollable time series graph | Tasks 8–9 | High |
| F5 | Data flagging (manual + automatic rules) | Tasks 10–12 | High |
| F6 | Tower shadow detection | Task 13 | Medium |
| F7 | Wind rose visualization | Task 14 | High |
| F8 | Frequency histogram + Weibull fit | Tasks 15–16 | High |
| F9 | Vertical wind shear (power law + log law) | Task 17 | High |
| F10 | Turbulence intensity analysis | Task 18 | High |
| F11 | Air density calculation | Task 19 | Medium |
| F12 | Extreme wind speed (50-yr gust) | Task 20 | Medium |
| F13 | MCP long-term adjustment (multiple algorithms) | Tasks 21–23 | High |
| F14 | ERA5 / MERRA-2 reference data download | Task 24 | High |
| F15 | Data reconstruction / gap filling (KNN) | Task 25 | Medium |
| F16 | Energy production estimates (power curve) | Task 26 | Medium |
| F17 | Scatterplots and polar scatterplots | Task 27 | Medium |
| F18 | Daily / monthly profile plots | Task 28 | Medium |
| F19 | Export to WAsP TAB, Openwind, CSV, IEA JSON | Task 29 | High |
| F20 | Report generation (Word/PDF) | Task 30 | High |
| F21 | Multi-step undo / change history | Task 31 | Low |
| F22 | Automated workflows | Task 32 | Low |
| F23 | KML / geospatial export | Task 33 | Low |
| F24 | SQL database integration | Already covered (PostgreSQL) | — |
| F25 | Data resampling (time step changes) | Task 9 | Medium |

---

## 5. Development Phases

### Phase 1: Foundation (Tasks 1–7) — ~1 week
Set up the project skeleton, database, API scaffolding, and basic data import. By the end, a user can create a project, upload a CSV, and see the data stored.

### Phase 2: Visualization Core (Tasks 8–9) — ~2 days
Build the interactive time series chart — the heart of the application.

### Phase 3: Data Quality (Tasks 10–13) — ~4 days
Implement the flagging system, automatic QC rules, and tower shadow detection.

### Phase 4: Core Analysis (Tasks 14–20) — ~7 days
Wind roses, histograms, Weibull fits, shear, turbulence, air density, extreme wind.

### Phase 5: Long-Term Adjustment (Tasks 21–25) — ~5 days
MCP algorithms, reference data download, data reconstruction.

### Phase 6: Energy & Advanced Viz (Tasks 26–28) — ~3 days
Power curve analysis, energy estimates, scatterplots, profiles.

### Phase 7: Export & Reports (Tasks 29–30) — ~2 days
Export engine (TAB, CSV, JSON) and report generator.

### Phase 8: Polish & Advanced (Tasks 31–35) — ~5 days
Undo system, workflows, testing, deployment, documentation.

---

## 6. Incremental Daily Tasks

---

### Task 1: Project Scaffolding — Backend
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: None

**Objective**: Create the FastAPI backend skeleton with project structure, configuration, and health-check endpoint.

**Files to Create/Modify**:
- `backend/pyproject.toml`
- `backend/app/__init__.py`
- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/database.py`
- `backend/.env.example`
- `docker-compose.yml` (PostgreSQL service)
- `backend/app/api/__init__.py`
- `backend/app/models/__init__.py`
- `backend/app/schemas/__init__.py`
- `backend/app/services/__init__.py`
- `backend/app/utils/__init__.py`

**Implementation Details**:
1. Initialize `pyproject.toml` with dependencies: fastapi, uvicorn, sqlalchemy, alembic, psycopg2-binary, pandas, numpy, scipy, python-dotenv, pydantic-settings
2. Create `config.py` using Pydantic `BaseSettings` to read `DATABASE_URL`, `CORS_ORIGINS`, `DEBUG` from environment
3. Create `database.py` with async SQLAlchemy engine, `SessionLocal`, and `get_db` dependency
4. Create `main.py` with FastAPI app instance:
   - CORS middleware (allow all origins in dev)
   - `/api/health` endpoint returning `{"status": "ok", "version": "0.1.0"}`
   - Lifespan handler for DB connection pool
5. Create `docker-compose.yml` with PostgreSQL 15 service (port 5432, volume for persistence)
6. Create all `__init__.py` files for package structure

**Acceptance Criteria**:
- [ ] `docker-compose up -d` starts PostgreSQL
- [ ] `uvicorn app.main:app --reload` starts the server on port 8000
- [ ] `GET /api/health` returns 200 with JSON `{"status": "ok"}`
- [ ] All package directories exist with `__init__.py`

**Stopping Point**: Server starts, health endpoint works, DB connection is configured (even if no tables exist yet).

---

### Task 2: Database Models & Migrations
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: Task 1

**Objective**: Define all core SQLAlchemy ORM models and set up Alembic for migrations.

**Files to Create/Modify**:
- `backend/app/models/project.py`
- `backend/app/models/dataset.py`
- `backend/app/models/timeseries.py`
- `backend/app/models/flag.py`
- `backend/app/models/analysis_result.py`
- `backend/app/models/__init__.py` (re-export all)
- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/versions/` (auto-generated initial migration)

**Implementation Details**:
1. Define models matching the schema in Section 2.3:
   - `Project` — id (UUID), name, description, latitude, longitude, elevation, timestamps
   - `Dataset` — id, project_id FK, name, source_type, file_name, time_step_seconds, start_time, end_time, metadata (JSON), timestamps
   - `DataColumn` — id, dataset_id FK, name, unit, measurement_type, height_m, sensor_info (JSON)
   - `TimeseriesData` — id (BigInt), dataset_id FK, timestamp, values (JSON)
   - `Flag` — id, dataset_id FK, name, color, description
   - `FlagRule` — id, flag_id FK, rule_json (JSON)
   - `FlaggedRange` — id, flag_id FK, start_time, end_time, applied_by, column_ids (ARRAY)
   - `AnalysisResult` — id, dataset_id FK, analysis_type, parameters (JSON), results (JSON), timestamps
2. Use `mapped_column` with SQLAlchemy 2.0 style
3. Initialize Alembic with `alembic init alembic`
4. Configure `alembic/env.py` to import all models and use `DATABASE_URL` from config
5. Generate initial migration: `alembic revision --autogenerate -m "initial tables"`
6. Run migration: `alembic upgrade head`

**Acceptance Criteria**:
- [ ] All 8 tables created in PostgreSQL after running migrations
- [ ] `alembic current` shows the head revision
- [ ] Models can be imported: `from app.models import Project, Dataset, ...`
- [ ] Relationships work (Dataset.project, Flag.dataset, etc.)

**Stopping Point**: All tables exist in the DB, models are importable, ORM relationships are defined.

---

### Task 3: Project CRUD API
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: Task 2

**Objective**: Build REST endpoints for creating, listing, reading, updating, and deleting projects.

**Files to Create/Modify**:
- `backend/app/schemas/project.py`
- `backend/app/api/projects.py`
- `backend/app/main.py` (register router)
- `backend/tests/conftest.py`
- `backend/tests/test_projects.py`

**Implementation Details**:
1. Define Pydantic schemas in `schemas/project.py`:
   - `ProjectCreate(name, description?, latitude?, longitude?, elevation?)`
   - `ProjectUpdate(name?, description?, latitude?, longitude?, elevation?)`
   - `ProjectResponse(id, name, description, latitude, longitude, elevation, created_at, updated_at, dataset_count)`
   - `ProjectListResponse(projects: list[ProjectResponse], total: int)`
2. Create `api/projects.py` router with prefix `/api/projects`:
   - `POST /` — create project
   - `GET /` — list projects (with pagination: `?skip=0&limit=20`)
   - `GET /{project_id}` — get single project (include dataset count)
   - `PUT /{project_id}` — update project
   - `DELETE /{project_id}` — delete project (cascades to datasets)
3. Register router in `main.py`
4. Write tests using `httpx.AsyncClient` and a test database

**Acceptance Criteria**:
- [ ] `POST /api/projects` creates a project and returns 201
- [ ] `GET /api/projects` returns paginated list
- [ ] `GET /api/projects/{id}` returns project with dataset_count
- [ ] `PUT /api/projects/{id}` updates fields
- [ ] `DELETE /api/projects/{id}` removes project and returns 204
- [ ] Tests pass with `pytest`

**Stopping Point**: Full CRUD for projects works via API, tests pass.

---

### Task 4: File Upload & CSV Parser
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: Task 3

**Objective**: Implement file upload endpoint and a CSV/text file parser that auto-detects columns.

**Files to Create/Modify**:
- `backend/app/api/import_engine.py`
- `backend/app/services/file_parsers/__init__.py`
- `backend/app/services/file_parsers/csv_parser.py`
- `backend/app/services/file_parsers/auto_detect.py`
- `backend/app/schemas/dataset.py`
- `backend/app/main.py` (register router)
- `data/sample_met_tower.csv` (create sample test file)

**Implementation Details**:
1. Create `data/sample_met_tower.csv` with realistic wind data:
   - Columns: Timestamp, Speed_40m, Speed_60m, Speed_80m, Dir_40m, Dir_60m, Temp_2m, Pressure_hPa, Speed_SD_40m, Speed_SD_60m
   - ~1000 rows at 10-minute intervals
   - Include some NaN gaps, realistic wind patterns
2. Create `csv_parser.py`:
   - `parse_csv(file_path: str) -> pd.DataFrame` — read any delimited text file
   - Handle multiple delimiters (comma, tab, semicolon) via sniffing
   - Parse timestamps automatically (`pd.to_datetime` with `infer_datetime_format`)
   - Return cleaned DataFrame with datetime index
3. Create `auto_detect.py`:
   - `detect_columns(df: pd.DataFrame) -> list[ColumnInfo]` — analyze column names and data to guess:
     - `measurement_type`: 'speed', 'direction', 'temperature', 'pressure', 'speed_sd', 'direction_sd'
     - `height_m`: extract numeric height from column name (e.g., "Speed_80m" → 80)
     - `unit`: infer from values and name
   - Use regex patterns: `r'(?:speed|ws|vel).*?(\d+)'`, `r'(?:dir|wd).*?(\d+)'`, etc.
4. Create `import_engine.py` router with prefix `/api/import`:
   - `POST /upload/{project_id}` — accept multipart file upload
     - Save file to temp directory
     - Parse with csv_parser
     - Run auto_detect
     - Return preview: first 20 rows + detected column metadata
   - `POST /confirm/{project_id}` — accept confirmed column mappings
     - Create Dataset record
     - Create DataColumn records
     - Bulk-insert timeseries data into `timeseries_data` table
     - Return dataset summary

**Acceptance Criteria**:
- [ ] Sample CSV file exists with realistic wind data
- [ ] Upload a CSV → get back preview with auto-detected columns
- [ ] Confirm import → data stored in DB with correct Dataset, DataColumn, and TimeseriesData records
- [ ] Column auto-detection correctly identifies speed, direction, temperature columns and heights
- [ ] Parser handles comma-delimited and tab-delimited files

**Stopping Point**: Can upload a CSV, see detected columns, confirm import, and verify data in the database.

---

### Task 5: Excel Parser & Enhanced Auto-Detection
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: Task 4

**Objective**: Add Excel file import support and improve the auto-detection logic for more file formats.

**Files to Create/Modify**:
- `backend/app/services/file_parsers/excel_parser.py`
- `backend/app/services/file_parsers/auto_detect.py` (enhance)
- `backend/app/services/file_parsers/__init__.py` (register parsers)
- `backend/app/api/import_engine.py` (update to route by file type)
- `data/sample_met_tower.xlsx` (create sample)

**Implementation Details**:
1. Create `excel_parser.py`:
   - `parse_excel(file_path: str, sheet_name: str | int = 0) -> pd.DataFrame`
   - Use openpyxl engine
   - Handle multi-row headers (common in met data exports): detect if first 1-3 rows are header/unit rows
   - Support sheet selection for multi-sheet workbooks
   - Return list of available sheet names if multiple exist
2. Enhance `auto_detect.py`:
   - Add patterns for: `SD` (standard deviation), `TI` (turbulence intensity), `max`, `min`, `gust`, `rh` (relative humidity), `solar` (solar radiation), `bp`/`baro` (barometric pressure)
   - Detect time step automatically by computing the median difference between timestamps
   - Add confidence scores to detection results
   - Handle column names with units in parentheses: "Speed (m/s) 80m"
3. Update `import_engine.py`:
   - Route to correct parser based on file extension (.csv, .txt → csv_parser; .xls, .xlsx → excel_parser)
   - Add `GET /import/sheets/{project_id}` endpoint for Excel files — returns sheet names so user can choose
4. Create a sample .xlsx file with met tower data (different format than the CSV)

**Acceptance Criteria**:
- [ ] Excel files (.xlsx) are parsed correctly
- [ ] Multi-row headers in Excel are handled
- [ ] Time step auto-detection works (returns seconds)
- [ ] Enhanced column detection finds SD, TI, gust, pressure with height
- [ ] Parser selection is automatic based on file extension

**Stopping Point**: Both CSV and Excel files can be uploaded, auto-detected, and imported into the database.

---

### Task 6: NRG & Campbell Scientific Parsers
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: Task 5

**Objective**: Add parsers for NRG Systems text exports and Campbell Scientific data formats — the two most common met tower logger formats.

**Files to Create/Modify**:
- `backend/app/services/file_parsers/nrg_parser.py`
- `backend/app/services/file_parsers/campbell_parser.py`
- `backend/app/services/file_parsers/__init__.py` (register)
- `backend/app/api/import_engine.py` (update routing)
- `data/sample_nrg.txt` (create sample)
- `data/sample_campbell.dat` (create sample)

**Implementation Details**:
1. Create `nrg_parser.py` for NRG Systems text export format:
   - NRG exports typically have a header section with site info, then column headers, then data
   - Parse the header to extract site metadata (site number, latitude, longitude, elevation)
   - Handle NRG column naming convention (e.g., "Ch1Avg", "Ch1SD", "Ch1Max")
   - Map NRG channel numbers to measurement types using header metadata
   - Return DataFrame + metadata dict
2. Create `campbell_parser.py` for Campbell Scientific TOA5 format:
   - TOA5 files have 4 header lines: file info, column names, units, processing type
   - Parse all 4 header lines to build complete column metadata
   - Handle the "TIMESTAMP" column format (YYYY-MM-DD HH:MM:SS)
   - Return DataFrame + metadata dict with units
3. Create sample data files mimicking these formats
4. Update the file router to attempt format detection by:
   - File extension first (.dat → try Campbell, .txt → try NRG then CSV)
   - Content sniffing (look for "TOA5" header for Campbell, "Site Number" for NRG)

**Acceptance Criteria**:
- [ ] NRG text export files are parsed correctly with metadata extraction
- [ ] Campbell Scientific TOA5 .dat files are parsed correctly with unit extraction
- [ ] Auto-detection routes to the correct parser
- [ ] Sample files exist and parse successfully
- [ ] Metadata (site info, units) is stored in Dataset.metadata JSON field

**Stopping Point**: Three parser types work (CSV, Excel, NRG, Campbell). File type is auto-detected.

---

### Task 7: Frontend Scaffolding & Project Management UI
**Phase**: Foundation  
**Estimated Time**: 1 day  
**Dependencies**: Task 3

**Objective**: Create the React frontend skeleton with routing, layout, and the project management page.

**Files to Create/Modify**:
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/api/projects.ts`
- `frontend/src/stores/projectStore.ts`
- `frontend/src/types/project.ts`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/components/projects/ProjectList.tsx`
- `frontend/src/components/projects/ProjectCard.tsx`
- `frontend/src/components/common/Modal.tsx`
- `frontend/src/components/common/LoadingSpinner.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/ProjectPage.tsx`

**Implementation Details**:
1. Initialize with `npm create vite@latest frontend -- --template react-ts`
2. Install deps: `tailwindcss, @tailwindcss/forms, postcss, autoprefixer, react-router-dom, axios, zustand, react-hook-form, zod, @hookform/resolvers, lucide-react`
3. Configure TailwindCSS with dark mode support
4. Create `AppShell.tsx` — main layout with:
   - Left sidebar (collapsible, 240px) with navigation: Dashboard, Projects, Import, Time Series, QC, Analysis, MCP, Energy, Export
   - Top bar with app name "WindWhisper" and breadcrumbs
   - Main content area
5. Create `api/client.ts` — Axios instance with `baseURL: /api` and interceptors for error handling
6. Create `api/projects.ts` — functions: `listProjects()`, `getProject(id)`, `createProject(data)`, `updateProject(id, data)`, `deleteProject(id)`
7. Create `stores/projectStore.ts` (Zustand) — state for projects list, active project, loading states
8. Create `DashboardPage.tsx` — shows project list as cards, "New Project" button opens modal
9. Create `ProjectCard.tsx` — shows project name, location, dataset count, created date
10. Create `ProjectPage.tsx` — detail view for a single project (placeholder for dataset list)
11. Set up React Router with routes: `/` → Dashboard, `/project/:id` → ProjectPage

**Acceptance Criteria**:
- [ ] `npm run dev` starts frontend on port 5173
- [ ] App shell renders with sidebar navigation and top bar
- [ ] Dashboard page loads and displays projects from API
- [ ] Can create a new project via modal form
- [ ] Can click a project card to navigate to project detail page
- [ ] Sidebar highlights the active page
- [ ] Responsive layout (sidebar collapses on small screens)

**Stopping Point**: Frontend runs, project CRUD works through the UI, navigation between pages works.

---

### Task 8: File Upload UI & Import Flow
**Phase**: Foundation → Visualization  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 4, 7

**Objective**: Build the file upload and import confirmation UI with drag-and-drop, column preview, and mapping.

**Files to Create/Modify**:
- `frontend/src/pages/ImportPage.tsx`
- `frontend/src/components/import/FileUploader.tsx`
- `frontend/src/components/import/ColumnMapper.tsx`
- `frontend/src/components/import/ImportPreview.tsx`
- `frontend/src/api/datasets.ts`
- `frontend/src/types/dataset.ts`
- `frontend/src/stores/datasetStore.ts`

**Implementation Details**:
1. Install `react-dropzone` for drag-and-drop file upload
2. Create `FileUploader.tsx`:
   - Dropzone area with visual feedback (drag over highlight)
   - Accept .csv, .txt, .xlsx, .xls, .dat file types
   - Show upload progress bar
   - On upload, call `POST /api/import/upload/{project_id}`
3. Create `ColumnMapper.tsx`:
   - Display auto-detected columns in a table: Column Name | Detected Type | Height | Unit | Include?
   - Each row has dropdowns to override detected type and height
   - Measurement type dropdown: Speed, Direction, Temperature, Pressure, Speed SD, Direction SD, Turbulence Intensity, Gust, Other
   - Toggle to include/exclude columns
4. Create `ImportPreview.tsx`:
   - Show first 20 rows of data in a scrollable table
   - Highlight columns by measurement type (color-coded)
   - Show detected time step and date range
   - "Confirm Import" button → calls `POST /api/import/confirm/{project_id}`
5. Create `ImportPage.tsx` — three-step wizard:
   - Step 1: Upload file (FileUploader)
   - Step 2: Review & map columns (ColumnMapper)
   - Step 3: Preview & confirm (ImportPreview)
   - Success → redirect to project page

**Acceptance Criteria**:
- [ ] Can drag-and-drop a CSV file onto the upload zone
- [ ] Auto-detected columns display correctly with types and heights
- [ ] Can override column type and height via dropdowns
- [ ] Preview table shows first 20 rows of data
- [ ] Confirm import stores data and redirects to project page
- [ ] Error states are handled (invalid file, parse failure)

**Stopping Point**: Full import flow works end-to-end through the UI: upload → detect → map → confirm → stored.

---

### Task 9: Interactive Time Series Chart
**Phase**: Visualization Core  
**Estimated Time**: 1 day  
**Dependencies**: Task 8

**Objective**: Build the signature interactive time series visualization — scrollable, zoomable, with channel selection and resampling.

**Files to Create/Modify**:
- `frontend/src/pages/TimeSeriesPage.tsx`
- `frontend/src/components/timeseries/TimeSeriesChart.tsx`
- `frontend/src/components/timeseries/TimeSeriesControls.tsx`
- `frontend/src/components/timeseries/ChannelSelector.tsx`
- `frontend/src/hooks/useTimeSeries.ts`
- `frontend/src/api/datasets.ts` (add timeseries fetch)
- `backend/app/api/datasets.py` (add timeseries data endpoint)
- `backend/app/schemas/timeseries.py`

**Implementation Details**:
1. **Backend**: Create `GET /api/datasets/{dataset_id}/timeseries` endpoint:
   - Query params: `start`, `end`, `columns` (comma-separated IDs), `resample` (e.g., "10min", "1h", "1D", "1M")
   - Return downsampled data for the requested window (max 5000 points per request for performance)
   - If data exceeds 5000 points, auto-downsample using pandas resample (mean)
   - Return format: `{ timestamps: [...], columns: { "col_id": { name, unit, values: [...] } } }`
2. **Frontend**: Create `TimeSeriesChart.tsx` using Plotly.js:
   - Multi-line chart with shared X-axis (time)
   - Zoom with mouse scroll / drag-select
   - Pan by clicking and dragging
   - Double-click to reset view
   - Each channel gets a distinct color
   - Y-axis auto-scales per visible channel
   - Support dual Y-axes (e.g., speed on left, direction on right)
3. Create `ChannelSelector.tsx`:
   - List of all data columns for the dataset
   - Checkbox to show/hide each channel
   - Color indicator matching the chart line color
   - Group by measurement type (Speeds, Directions, Temperature, etc.)
4. Create `TimeSeriesControls.tsx`:
   - Resample dropdown: Raw, 10-min, Hourly, Daily, Monthly
   - Date range picker for quick navigation
   - "Fit All" button to show full dataset range
5. Create `useTimeSeries.ts` hook:
   - Manages fetching data based on visible window, selected channels, resample
   - Debounced re-fetch on zoom/pan (300ms)
   - Loading and error states

**Acceptance Criteria**:
- [ ] Time series chart renders with multiple channels
- [ ] Can zoom in/out smoothly with mouse
- [ ] Can pan left/right through the data
- [ ] Channel selector shows/hides lines dynamically
- [ ] Resampling works (raw → hourly → daily)
- [ ] Performance: chart stays responsive with 5000+ visible points
- [ ] Dual Y-axis works (speed + direction)

**Stopping Point**: Can view any dataset's time series interactively with zoom, pan, channel toggle, and resample.

---

### Task 10: Data Flagging System — Backend
**Phase**: Data Quality  
**Estimated Time**: 1 day  
**Dependencies**: Task 2

**Objective**: Implement the backend flagging system — CRUD for flags, manual flagging of time ranges, and automatic rule-based flagging.

**Files to Create/Modify**:
- `backend/app/api/qc.py`
- `backend/app/services/qc_engine.py`
- `backend/app/schemas/qc.py` (new)
- `backend/app/main.py` (register router)
- `backend/tests/test_qc.py`

**Implementation Details**:
1. Define Pydantic schemas in `schemas/qc.py`:
   - `FlagCreate(name, color, description?)`
   - `FlagResponse(id, name, color, description, rule_count, flagged_count)`
   - `FlagRuleCreate(column_id, operator, value, logic?)` — operators: `==`, `!=`, `<`, `>`, `<=`, `>=`, `between`, `is_null`
   - `ManualFlagRequest(flag_id, start_time, end_time, column_ids?)`
   - `FlaggedRangeResponse(id, flag_id, start_time, end_time, applied_by, column_ids)`
2. Create `api/qc.py` router with prefix `/api/qc`:
   - `POST /flags/{dataset_id}` — create a new flag for a dataset
   - `GET /flags/{dataset_id}` — list all flags for a dataset
   - `DELETE /flags/{flag_id}` — delete a flag and all its ranges
   - `POST /flags/{flag_id}/rules` — add an automatic rule to a flag
   - `GET /flags/{flag_id}/rules` — list rules for a flag
   - `POST /flags/{flag_id}/manual` — manually flag a time range
   - `POST /flags/{flag_id}/apply-rules` — run all rules for this flag, create flagged ranges
   - `GET /datasets/{dataset_id}/flagged-ranges` — get all flagged ranges for a dataset (for chart overlay)
   - `DELETE /flagged-ranges/{range_id}` — remove a specific flagged range
3. Create `services/qc_engine.py`:
   - `apply_rules(dataset_id, flag_id) -> list[FlaggedRange]`:
     - Load timeseries data for the dataset
     - For each rule, evaluate the condition against the specified column
     - Merge consecutive flagged timestamps into ranges (with configurable gap tolerance)
     - Store resulting FlaggedRange records
   - Support compound rules (AND logic between multiple rules on the same flag)
   - Common preset rules factory:
     - `icing_rules()` → temperature < 2°C AND speed_sd == 0
     - `range_check(min, max)` → flag values outside range
     - `flat_line(column, duration)` → flag periods where SD is zero for > duration

**Acceptance Criteria**:
- [ ] Can create flags with custom names and colors
- [ ] Can manually flag a time range via API
- [ ] Can define rules (column, operator, value) and apply them
- [ ] Rule application generates correct flagged ranges
- [ ] Compound AND rules work
- [ ] Can retrieve all flagged ranges for chart overlay
- [ ] Can delete individual flagged ranges
- [ ] Tests cover manual and automatic flagging

**Stopping Point**: Full flagging backend works — create flags, add rules, apply rules, flag time ranges.

---

### Task 11: Data Flagging UI
**Phase**: Data Quality  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 9, 10

**Objective**: Build the QC dashboard UI for managing flags, defining rules, and visualizing flagged data on the time series chart.

**Files to Create/Modify**:
- `frontend/src/pages/QCPage.tsx`
- `frontend/src/components/qc/FlagManager.tsx`
- `frontend/src/components/qc/FlagRuleEditor.tsx`
- `frontend/src/components/qc/QCDashboard.tsx`
- `frontend/src/components/timeseries/TimeSeriesChart.tsx` (add flag overlays)
- `frontend/src/api/qc.ts` (new)

**Implementation Details**:
1. Create `QCPage.tsx` — split layout:
   - Left panel (30%): FlagManager + FlagRuleEditor
   - Right panel (70%): Time series chart with flag overlays
2. Create `FlagManager.tsx`:
   - List of all flags for the dataset with color swatches
   - "Add Flag" button → inline form (name, color picker)
   - Each flag row shows: name, color, # of flagged records, expand arrow
   - Expand → shows rules and flagged ranges
   - "Apply Rules" button per flag
   - "Delete Flag" button with confirmation
3. Create `FlagRuleEditor.tsx`:
   - Form to add rules: select column → select operator → enter value
   - Support operators: equals, not equals, less than, greater than, between, is null
   - Preview: "Flag data where Speed_40m < 0.5"
   - Preset templates: "Icing Detection", "Range Check", "Flat Line Detection"
4. Update `TimeSeriesChart.tsx` to overlay flagged ranges:
   - Render semi-transparent colored rectangles behind the chart for each flagged range
   - Toggle flag visibility in the channel selector
   - Click on a flagged range → show tooltip with flag name and time range
5. Add manual flagging via chart interaction:
   - Shift+drag on the chart to select a time range
   - Show popup: "Flag this range as: [dropdown of flags]"
   - Confirm → creates manual flagged range

**Acceptance Criteria**:
- [ ] Flag list displays with colors and counts
- [ ] Can create new flags from the UI
- [ ] Can add rules using the form
- [ ] "Apply Rules" processes data and shows flagged ranges
- [ ] Flagged ranges appear as colored overlays on the time series chart
- [ ] Can manually flag a range by shift+dragging on the chart
- [ ] Can delete individual flags and ranges

**Stopping Point**: Full QC workflow works in UI — create flags, define rules, apply, visualize overlays, manual flagging.

---

### Task 12: Filtered Data Queries (Flag-Aware)
**Phase**: Data Quality  
**Estimated Time**: 1 day  
**Dependencies**: Task 11

**Objective**: Make all data queries flag-aware so that flagged data can be excluded from analysis and visualization.

**Files to Create/Modify**:
- `backend/app/api/datasets.py` (update timeseries endpoint)
- `backend/app/services/qc_engine.py` (add filtering utility)
- `backend/app/schemas/timeseries.py` (add filter params)
- `frontend/src/components/timeseries/TimeSeriesControls.tsx` (add flag filter toggles)
- `frontend/src/hooks/useTimeSeries.ts` (pass flag filters)

**Implementation Details**:
1. **Backend**: Add flag filtering to the timeseries endpoint:
   - New query param: `exclude_flags` (comma-separated flag IDs)
   - When provided, load flagged ranges for those flags and set affected values to NaN in the returned data
   - Create utility function `filter_flagged_data(df, dataset_id, exclude_flag_ids) -> df`:
     - For each flagged range matching the excluded flags, mask the DataFrame values
     - This utility will be reused by ALL analysis endpoints
2. **Backend**: Create a reusable service function:
   - `get_clean_dataframe(dataset_id, columns?, start?, end?, exclude_flags?) -> pd.DataFrame`
   - This becomes the standard way to load data for any analysis
   - Returns a DataFrame with NaN where flagged data was removed
3. **Frontend**: Add flag filter toggles to TimeSeriesControls:
   - Show each flag as a toggle with its color
   - "ON" = flagged data is visible (shown with flag overlay)
   - "OFF" = flagged data is excluded (gaps in the line)
   - "Show Clean Data Only" master toggle
4. Update the time series fetch hook to include `exclude_flags` parameter

**Acceptance Criteria**:
- [ ] Timeseries endpoint accepts `exclude_flags` parameter
- [ ] Flagged data is replaced with NaN when excluded
- [ ] `get_clean_dataframe()` utility works and is reusable
- [ ] Frontend flag toggles control data visibility
- [ ] Chart shows gaps where flagged data is excluded
- [ ] Performance: filtering doesn't significantly slow queries

**Stopping Point**: All data access is flag-aware. Toggling flags in the UI dynamically shows/hides flagged data.

---

### Task 13: Tower Shadow Detection
**Phase**: Data Quality  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Implement automatic tower shadow detection algorithm that identifies and flags data affected by mast interference.

**Files to Create/Modify**:
- `backend/app/services/tower_shadow.py` (new)
- `backend/app/api/qc.py` (add tower shadow endpoint)
- `frontend/src/components/qc/TowerShadowDetector.tsx` (new)
- `frontend/src/pages/QCPage.tsx` (integrate)

**Implementation Details**:
1. Create `tower_shadow.py` with two detection methods:
   - **Method A: Known boom orientation** — given boom orientations (degrees), calculate expected tower shadow sectors:
     - Shadow sector = boom direction ± shadow_width (typically 180° ± 10–30°)
     - For each boom direction, flag speed data from that boom's height when wind comes from the shadow sector
   - **Method B: Automatic detection** — analyze speed ratio between paired sensors at the same height:
     - Bin wind direction in 5° bins
     - For each bin, compute the ratio of speeds from two anemometers
     - Tower shadow appears as a dip in the ratio at the direction where the tower obstructs one anemometer
     - Detect dips using a threshold (ratio drops below mean - 2*std)
     - Return detected shadow sectors
   - Both methods return a list of `(direction_start, direction_end, affected_columns)` tuples
2. Create endpoint `POST /api/qc/tower-shadow/{dataset_id}`:
   - Accept params: `method` ('manual' or 'auto'), `boom_orientations?` (list of degrees), `shadow_width?`
   - Run detection and create a "Tower Shadow" flag with appropriate ranges
3. Create `TowerShadowDetector.tsx`:
   - Form to enter boom orientations (or select "auto-detect")
   - Polar plot showing detected shadow sectors
   - Preview of how many data points would be flagged
   - Confirm → applies the flag

**Acceptance Criteria**:
- [ ] Known-orientation method correctly flags shadow sectors
- [ ] Auto-detection identifies shadow direction from speed ratio analysis
- [ ] Results are displayed on a polar plot
- [ ] User can confirm and flag tower shadow data
- [ ] Flagged tower shadow data integrates with the existing flag system

**Stopping Point**: Tower shadow can be detected (both methods), previewed on a polar plot, and applied as a QC flag.

---

### Task 14: Wind Rose Chart
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Build the wind rose visualization — frequency by direction, mean speed by direction, and energy by direction.

**Files to Create/Modify**:
- `backend/app/api/analysis.py` (new)
- `backend/app/schemas/analysis.py`
- `frontend/src/components/analysis/WindRoseChart.tsx`
- `frontend/src/pages/AnalysisPage.tsx`

**Implementation Details**:
1. **Backend**: Create `POST /api/analysis/wind-rose/{dataset_id}` endpoint:
   - Accept: `direction_column_id`, `value_column_id` (speed), `num_sectors` (12, 16, or 36), `exclude_flags?`
   - Compute using `get_clean_dataframe()`:
     - **Frequency rose**: % of time wind blows from each sector
     - **Mean value rose**: average of value_column per direction sector
     - **Energy rose**: sum of v³ per sector (proportional to energy)
   - Return: `{ sectors: [{ direction, frequency, mean_value, energy, speed_bins: [{range, count}] }] }`
   - Speed bins for the frequency rose: 0-3, 3-6, 6-9, 9-12, 12-15, 15+ m/s (configurable)
2. **Frontend**: Create `WindRoseChart.tsx` using D3.js:
   - Polar bar chart with concentric rings for frequency %
   - Stacked bars colored by wind speed bins
   - Labels for N, NE, E, SE, S, SW, W, NW
   - Three display modes: Frequency, Mean Speed, Energy (tabs)
   - Hover tooltip showing sector stats
   - Legend for speed bins
3. Create `AnalysisPage.tsx`:
   - Tab layout: Wind Rose | Histogram | Shear | Turbulence | Air Density | Extreme Wind
   - Sidebar: column selectors, flag filters, display options
   - Start with Wind Rose tab, other tabs as placeholders

**Acceptance Criteria**:
- [ ] Wind rose renders as a polar chart with direction sectors
- [ ] Speed-binned stacked bars show correctly
- [ ] Three modes work: frequency, mean speed, energy
- [ ] Respects flag exclusions (clean data only)
- [ ] Hover tooltips show sector statistics
- [ ] Can configure number of sectors (12/16/36)
- [ ] Chart is visually polished and readable

**Stopping Point**: Wind rose chart works with all three modes, respects QC flags, interactive tooltips.

---

### Task 15: Frequency Histogram
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 14

**Objective**: Build frequency histogram for any data column with configurable bins.

**Files to Create/Modify**:
- `backend/app/api/analysis.py` (add histogram endpoint)
- `frontend/src/components/analysis/FrequencyHistogram.tsx`
- `frontend/src/pages/AnalysisPage.tsx` (activate Histogram tab)

**Implementation Details**:
1. **Backend**: Create `POST /api/analysis/histogram/{dataset_id}`:
   - Accept: `column_id`, `num_bins` (default 30), `bin_width?`, `min_val?`, `max_val?`, `exclude_flags?`
   - Load clean data, compute histogram using `np.histogram`
   - Return: `{ bins: [{ lower, upper, count, frequency_pct }], stats: { mean, std, min, max, median, count, data_recovery_pct } }`
2. **Frontend**: Create `FrequencyHistogram.tsx` using Recharts:
   - Bar chart with bins on X-axis, frequency % on Y-axis
   - Optional: show count on secondary Y-axis
   - Stats panel below chart: mean, std, min, max, median, recovery %
   - Column selector dropdown
   - Bin width control (slider or input)
   - Export histogram data as CSV (client-side)

**Acceptance Criteria**:
- [ ] Histogram renders for any selected column
- [ ] Bin count / width is configurable
- [ ] Statistics panel shows correct values
- [ ] Respects flag exclusions
- [ ] Clean, readable visualization with axis labels

**Stopping Point**: Histogram works for any column with configurable bins and statistics summary.

---

### Task 16: Weibull Distribution Fit & Overlay
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 15

**Objective**: Implement Weibull distribution fitting for wind speed data and overlay it on the frequency histogram.

**Files to Create/Modify**:
- `backend/app/services/weibull.py`
- `backend/app/api/analysis.py` (add Weibull endpoint)
- `frontend/src/components/analysis/WeibullOverlay.tsx`
- `frontend/src/components/analysis/FrequencyHistogram.tsx` (integrate overlay)

**Implementation Details**:
1. Create `services/weibull.py`:
   - `fit_weibull(speeds: np.ndarray) -> dict`:
     - Remove NaN and zero values
     - Use `scipy.stats.weibull_min.fit(data, floc=0)` to get shape (k) and scale (A) parameters
     - Also compute using the WAsP method (moments-based) for comparison
     - Calculate goodness of fit: R², RMSE, Kolmogorov-Smirnov statistic
     - Return `{ k, A, mean_speed, mean_power_density, r_squared, rmse, ks_stat, method }`
   - `weibull_pdf(x: np.ndarray, k: float, A: float) -> np.ndarray`
   - `weibull_cdf(x: np.ndarray, k: float, A: float) -> np.ndarray`
2. **Backend**: Create `POST /api/analysis/weibull/{dataset_id}`:
   - Accept: `column_id`, `exclude_flags?`
   - Run `fit_weibull` on the speed data
   - Return Weibull parameters + PDF curve points for overlay
3. **Frontend**: Create `WeibullOverlay.tsx`:
   - Receives Weibull params and renders the PDF curve as a line overlay on the histogram
   - Display panel showing: k parameter, A parameter (or c), mean speed, mean power density, R², method
   - Toggle to switch between MLE and moments fitting methods
4. Integrate into `FrequencyHistogram.tsx`:
   - When the selected column is a wind speed column, automatically fetch and show Weibull overlay
   - Toggle to show/hide the fit curve

**Acceptance Criteria**:
- [ ] Weibull fit runs correctly using scipy MLE
- [ ] Weibull PDF curve overlays correctly on the histogram
- [ ] k and A parameters display with goodness-of-fit metrics
- [ ] Fit is automatically shown for wind speed columns
- [ ] Can toggle Weibull overlay on/off

**Stopping Point**: Weibull fits and overlays on the histogram, parameters and fit quality are displayed.

---

### Task 17: Vertical Wind Shear Analysis
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Implement wind shear calculation using power law and log law, with extrapolation to user-specified heights.

**Files to Create/Modify**:
- `backend/app/services/wind_shear.py`
- `backend/app/api/analysis.py` (add shear endpoints)
- `frontend/src/components/analysis/WindShearPanel.tsx`
- `frontend/src/pages/AnalysisPage.tsx` (activate Shear tab)

**Implementation Details**:
1. Create `services/wind_shear.py`:
   - `calculate_power_law_alpha(speed_lower, speed_upper, height_lower, height_upper) -> np.ndarray`:
     - α = ln(v₂/v₁) / ln(z₂/z₁) per timestamp
     - Return array of shear exponents
   - `calculate_log_law_roughness(speed_lower, speed_upper, height_lower, height_upper) -> np.ndarray`:
     - z₀ = exp((v₁·ln(z₂) - v₂·ln(z₁)) / (v₁ - v₂))
     - Return array of roughness lengths
   - `extrapolate_speed(speeds, height_from, height_to, alpha_or_z0, method='power') -> np.ndarray`:
     - Power law: v₂ = v₁ × (z₂/z₁)^α
     - Log law: v₂ = v₁ × ln(z₂/z₀) / ln(z₁/z₀)
   - `shear_profile(speeds_by_height: dict, method='power') -> dict`:
     - Given {height: speed_array}, compute shear for all height pairs
     - Return mean alpha/z0, profiles, statistics
   - `extrapolate_to_height(dataset_id, target_height, method, exclude_flags) -> dict`:
     - Use all available speed columns at different heights
     - Return extrapolated time series at the target height
2. **Backend endpoints**:
   - `POST /api/analysis/shear/{dataset_id}` — compute shear between all height pairs
   - `POST /api/analysis/extrapolate/{dataset_id}` — extrapolate to target height, return new time series
3. **Frontend**: Create `WindShearPanel.tsx`:
   - Display: vertical profile plot (height on Y-axis, speed on X-axis) with measured + extrapolated points
   - Table of shear values between each height pair (mean, median, std of alpha)
   - Alpha by direction plot (polar or bar chart)
   - Alpha by time-of-day plot (diurnal pattern)
   - Input: target extrapolation height
   - Method selector: Power Law / Log Law
   - "Create Extrapolated Channel" button → saves extrapolated data as a new DataColumn

**Acceptance Criteria**:
- [ ] Power law alpha calculated correctly between height pairs
- [ ] Log law roughness length calculated correctly
- [ ] Extrapolation to target height works with both methods
- [ ] Vertical profile plot shows measured + extrapolated speeds
- [ ] Shear by direction and time-of-day plots render
- [ ] Can save extrapolated data as a new column in the dataset

**Stopping Point**: Shear is calculated, visualized (profile, direction, diurnal), and extrapolation creates a new channel.

---

### Task 18: Turbulence Intensity Analysis
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Implement turbulence intensity (TI) calculation and visualization per IEC standards.

**Files to Create/Modify**:
- `backend/app/services/turbulence.py`
- `backend/app/api/analysis.py` (add TI endpoint)
- `frontend/src/components/analysis/TurbulencePanel.tsx`
- `frontend/src/pages/AnalysisPage.tsx` (activate Turbulence tab)

**Implementation Details**:
1. Create `services/turbulence.py`:
   - `calculate_ti(speed_mean: np.ndarray, speed_sd: np.ndarray) -> np.ndarray`:
     - TI = σ / U for each timestamp
   - `ti_by_speed_bin(speeds, ti_values, bin_width=1.0) -> dict`:
     - Bin by wind speed (1 m/s bins)
     - For each bin: mean TI, representative TI (mean + 1.28 × std), 90th percentile
     - Include IEC 61400-1 reference curves (Class A, B, C)
   - `ti_by_direction(directions, ti_values, num_sectors=12) -> dict`:
     - TI statistics by direction sector
   - `ti_summary(speeds, ti_values) -> dict`:
     - Overall statistics, characteristic TI at 15 m/s
2. **Backend**: `POST /api/analysis/turbulence/{dataset_id}`:
   - Accept: `speed_column_id`, `sd_column_id`, `exclude_flags?`
   - Return: binned TI, directional TI, summary stats
3. **Frontend**: Create `TurbulencePanel.tsx`:
   - **TI vs Wind Speed scatter** — each dot colored by density, with IEC class curves overlaid
   - **Representative TI by speed bin** — bar chart with IEC class lines
   - **TI by direction** — polar bar chart
   - Summary stats panel: mean TI, characteristic TI at 15 m/s, IEC class recommendation
   - Column selectors for speed mean and speed SD

**Acceptance Criteria**:
- [ ] TI calculated correctly as σ/U
- [ ] TI by speed bin chart with IEC class reference curves
- [ ] TI by direction polar chart
- [ ] IEC class recommendation based on characteristic TI at 15 m/s
- [ ] Scatter plot of all TI values vs speed
- [ ] Respects flag exclusions

**Stopping Point**: TI analysis fully functional with scatter, binned, directional views and IEC class comparison.

---

### Task 19: Air Density Calculation
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Calculate air density from temperature and pressure data, with elevation-based defaults.

**Files to Create/Modify**:
- `backend/app/services/air_density.py`
- `backend/app/api/analysis.py` (add air density endpoint)
- `frontend/src/components/analysis/AirDensityPanel.tsx`
- `frontend/src/pages/AnalysisPage.tsx` (activate Air Density tab)

**Implementation Details**:
1. Create `services/air_density.py`:
   - `calculate_air_density(temperature_C: np.ndarray, pressure_hPa: np.ndarray) -> np.ndarray`:
     - ρ = P / (R_d × T) where T in Kelvin, P in Pa, R_d = 287.05 J/(kg·K)
   - `estimate_pressure_from_elevation(elevation_m: float) -> float`:
     - Use barometric formula for standard atmosphere
   - `air_density_summary(density: np.ndarray) -> dict`:
     - mean, median, std, min, max, monthly averages
   - `wind_power_density(speeds: np.ndarray, density: np.ndarray) -> np.ndarray`:
     - WPD = 0.5 × ρ × v³ per timestamp
   - `mean_wind_power_density(speeds, density) -> dict`:
     - Overall and by month
2. **Backend**: `POST /api/analysis/air-density/{dataset_id}`
3. **Frontend**: Create `AirDensityPanel.tsx`:
   - Time series of air density (small chart)
   - Monthly average air density bar chart
   - Wind power density by month chart
   - Summary: mean density, mean WPD, annual WPD
   - Option to use measured or elevation-estimated pressure

**Acceptance Criteria**:
- [ ] Air density calculated from temperature + pressure
- [ ] Fallback to elevation-based pressure estimation
- [ ] Wind power density calculated
- [ ] Monthly variation charts display correctly
- [ ] Summary statistics are accurate

**Stopping Point**: Air density and wind power density calculated, displayed with monthly breakdowns.

---

### Task 20: Extreme Wind Analysis
**Phase**: Core Analysis  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Implement extreme wind speed analysis including annual maxima and 50-year return period estimation.

**Files to Create/Modify**:
- `backend/app/services/extreme_wind.py`
- `backend/app/api/analysis.py` (add extreme wind endpoint)
- `frontend/src/components/analysis/ExtremeWindPanel.tsx`
- `frontend/src/pages/AnalysisPage.tsx` (activate Extreme Wind tab)

**Implementation Details**:
1. Create `services/extreme_wind.py`:
   - `annual_maxima(speeds: pd.Series) -> pd.Series`:
     - Extract annual maximum wind speed (or gust if available)
   - `fit_gumbel(annual_max: np.ndarray) -> dict`:
     - Fit Gumbel (Type I extreme value) distribution using method of moments
     - `scipy.stats.gumbel_r.fit(data)`
     - Return location (μ) and scale (β) parameters
   - `return_period_speed(gumbel_params: dict, return_period_years: float) -> float`:
     - V_T = μ - β × ln(-ln(1 - 1/T))
   - `extreme_wind_summary(speeds, gust_column?) -> dict`:
     - Annual maxima table
     - 50-year extreme gust (V_e50)
     - 3-second gust factor if both mean and gust data available
     - Return periods: 10, 20, 50, 100 years
     - Confidence intervals
2. **Backend**: `POST /api/analysis/extreme-wind/{dataset_id}`
3. **Frontend**: Create `ExtremeWindPanel.tsx`:
   - Return period plot: X-axis = return period (log scale), Y-axis = wind speed, with Gumbel fit line and data points
   - Annual maxima table
   - Key results panel: V_e50, V_e100, gust factor
   - Note if data period is short (< 1 year) — warn about unreliability

**Acceptance Criteria**:
- [ ] Annual maxima extracted correctly
- [ ] Gumbel distribution fitted
- [ ] 50-year extreme speed calculated
- [ ] Return period plot renders with fitted curve
- [ ] Warning shown when data period is insufficient
- [ ] Multiple return periods displayed (10, 20, 50, 100 yr)

**Stopping Point**: Extreme wind analysis with Gumbel fit, return period plot, and V_e50 calculated.

---

### Task 21: MCP Engine — Backend (Linear & Variance Ratio)
**Phase**: Long-Term Adjustment  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Implement the MCP (Measure-Correlate-Predict) engine with Linear Least Squares and Variance Ratio algorithms.

**Files to Create/Modify**:
- `backend/app/services/mcp_engine.py`
- `backend/app/api/mcp.py`
- `backend/app/schemas/mcp.py` (new)
- `backend/app/main.py` (register router)
- `backend/tests/test_mcp.py`

**Implementation Details**:
1. Create `services/mcp_engine.py`:
   - `align_concurrent(site_data: pd.Series, ref_data: pd.Series) -> tuple[pd.Series, pd.Series]`:
     - Align two time series to their concurrent overlap period
     - Remove rows where either has NaN
     - Return aligned pair
   - `correlation_stats(site: np.ndarray, ref: np.ndarray) -> dict`:
     - R², Pearson r, RMSE, bias, slope, intercept, concurrent period dates
   - `mcp_linear_least_squares(site: pd.Series, ref: pd.Series, ref_full: pd.Series) -> dict`:
     - Fit linear regression: site = a × ref + b (on concurrent period)
     - Apply to full reference period → predicted long-term site series
     - Return: predicted_series, params (a, b), stats (R², RMSE)
   - `mcp_variance_ratio(site: pd.Series, ref: pd.Series, ref_full: pd.Series) -> dict`:
     - Calculate variance ratio adjustment to preserve site speed distribution
     - predicted = ref_mean_site + (ref - ref_mean_concurrent) × (σ_site / σ_ref)
     - Return: predicted_series, params, stats
   - `mcp_summary(predicted: pd.Series, method: str) -> dict`:
     - Long-term mean speed, Weibull k & A, monthly means, annual means
2. **Backend**: Create `api/mcp.py` with prefix `/api/mcp`:
   - `POST /correlate` — align two datasets and return correlation stats + scatterplot data
   - `POST /predict` — run MCP with specified method on concurrent period, return long-term prediction
   - `POST /compare` — run multiple methods, return comparison table
3. Define schemas in `schemas/mcp.py`

**Acceptance Criteria**:
- [ ] Linear least squares MCP produces correct long-term prediction
- [ ] Variance ratio MCP produces correct prediction
- [ ] Correlation statistics are accurate (R², RMSE)
- [ ] Concurrent period alignment works correctly
- [ ] Long-term summary (mean speed, Weibull params) is calculated
- [ ] Tests validate MCP results against known values

**Stopping Point**: Two MCP algorithms work end-to-end: correlate → predict → long-term summary.

---

### Task 22: MCP Engine — Matrix Method & Algorithm Comparison
**Phase**: Long-Term Adjustment  
**Estimated Time**: 1 day  
**Dependencies**: Task 21

**Objective**: Add the matrix method for multi-sensor MCP and build the algorithm comparison framework.

**Files to Create/Modify**:
- `backend/app/services/mcp_engine.py` (extend)
- `backend/app/api/mcp.py` (extend)
- `backend/tests/test_mcp.py` (extend)

**Implementation Details**:
1. Add to `mcp_engine.py`:
   - `mcp_matrix_method(site_columns: dict[str, pd.Series], ref_columns: dict[str, pd.Series], ref_full: dict[str, pd.Series]) -> dict`:
     - Multi-variate regression correlating multiple site sensors with multiple reference series
     - Use `sklearn.linear_model.LinearRegression` for multivariate fit
     - Return predicted series for each site sensor + stats
   - `compare_mcp_methods(site, ref, ref_full, methods=['linear', 'variance_ratio', 'matrix']) -> dict`:
     - Run all specified methods
     - For each: compute cross-validation metrics (leave-one-month-out)
     - Rank by uncertainty (RMSE of cross-validation)
     - Return comparison table: method, R², RMSE, mean predicted speed, Weibull k, uncertainty
   - `cross_validate_mcp(site, ref, ref_full, method, folds='monthly') -> dict`:
     - Leave-one-month-out cross-validation
     - For each fold: train on N-1 months, predict the held-out month, compare to actual
     - Return RMSE, bias, skill score
2. **Backend**: Update endpoints:
   - `POST /mcp/predict` — add `method: 'matrix'` option
   - `POST /mcp/compare` — run all methods and return ranked comparison

**Acceptance Criteria**:
- [ ] Matrix method works with multiple site/reference columns
- [ ] Cross-validation produces meaningful uncertainty estimates
- [ ] Comparison ranks methods by uncertainty
- [ ] All three methods produce consistent results on test data
- [ ] Tests cover edge cases (short concurrent period, poor correlation)

**Stopping Point**: Three MCP methods implemented with cross-validation and comparison framework.

---

### Task 23: MCP Frontend — Workspace UI
**Phase**: Long-Term Adjustment  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 22, 9

**Objective**: Build the MCP workspace UI for selecting data, running correlations, comparing methods, and viewing results.

**Files to Create/Modify**:
- `frontend/src/pages/MCPPage.tsx`
- `frontend/src/components/mcp/MCPWorkspace.tsx`
- `frontend/src/components/mcp/ReferenceDataSelector.tsx`
- `frontend/src/components/mcp/CorrelationChart.tsx`
- `frontend/src/components/mcp/LTAResultsTable.tsx`
- `frontend/src/api/analysis.ts` (add MCP calls)

**Implementation Details**:
1. Create `MCPPage.tsx` — full MCP workflow page:
   - Step 1: Select site dataset & column (on-site measurement)
   - Step 2: Select reference dataset & column (long-term reference)
   - Step 3: Run correlation → view results
   - Step 4: Choose method → predict → view long-term results
2. Create `ReferenceDataSelector.tsx`:
   - List all datasets in the project
   - Highlight reference/reanalysis type datasets
   - Show concurrent overlap period when site + reference are selected
   - Display data recovery % in overlap
3. Create `CorrelationChart.tsx`:
   - Scatterplot of concurrent data (site vs reference speed)
   - Regression line overlay
   - Color points by season or month
   - Display R², slope, intercept, RMSE
4. Create `LTAResultsTable.tsx`:
   - Method comparison table: Method | R² | RMSE | Predicted Mean Speed | Weibull k | Uncertainty
   - Highlight the recommended (lowest uncertainty) method
   - Monthly long-term means chart (bar chart with error bars)
   - Side-by-side: measured short-term vs predicted long-term frequency histograms
5. Create `MCPWorkspace.tsx` — orchestrates the entire workflow with a stepper component

**Acceptance Criteria**:
- [ ] Can select site and reference datasets/columns
- [ ] Correlation scatterplot renders with regression line and stats
- [ ] Method comparison table shows all three methods ranked
- [ ] Long-term monthly means displayed as bar chart
- [ ] Short-term vs long-term histogram comparison visible
- [ ] Recommended method is highlighted

**Stopping Point**: Full MCP workflow works in UI from data selection through method comparison and long-term results.

---

### Task 24: ERA5 / MERRA-2 Reference Data Download
**Phase**: Long-Term Adjustment  
**Estimated Time**: 1 day  
**Dependencies**: Task 3

**Objective**: Enable downloading ERA5 and MERRA-2 reanalysis data as reference datasets for MCP.

**Files to Create/Modify**:
- `backend/app/services/reanalysis_download.py` (new)
- `backend/app/api/mcp.py` (add download endpoints)
- `frontend/src/components/mcp/ReferenceDataSelector.tsx` (add download UI)

**Implementation Details**:
1. Create `services/reanalysis_download.py`:
   - **ERA5** via CDS API (`cdsapi` library):
     - `download_era5(lat, lon, start_year, end_year, variables=['100m_u/v_component_of_wind', '10m_u/v_component_of_wind', '2m_temperature', 'surface_pressure']) -> pd.DataFrame`
     - Convert u/v components to speed and direction
     - Resample to hourly or monthly as needed
     - Return DataFrame with standard columns
   - **MERRA-2** via NASA GES DISC (OPeNDAP or direct download):
     - `download_merra2(lat, lon, start_year, end_year) -> pd.DataFrame`
     - Use xarray to handle NetCDF data
     - Extract wind speed at 50m, temperature, pressure at nearest grid point
   - Both functions:
     - Cache downloaded data locally (avoid redundant downloads)
     - Provide download progress callback for WebSocket updates
     - Handle API key configuration (CDS API key for ERA5, EarthData for MERRA-2)
2. **Backend endpoints**:
   - `POST /api/mcp/download-reference` — initiate download with params (source, lat, lon, years)
   - `GET /api/mcp/download-status/{task_id}` — check download progress
   - Downloads run as background tasks (FastAPI BackgroundTasks or Celery)
3. **Frontend**: Add "Download Reference Data" section in ReferenceDataSelector:
   - Source selector: ERA5, MERRA-2
   - Auto-fill lat/lon from project
   - Year range selector (default: 20 years back to present)
   - Download button with progress indicator
   - On complete: new reference dataset appears in the project

**Acceptance Criteria**:
- [ ] ERA5 download works for a given lat/lon and date range
- [ ] MERRA-2 download works for a given lat/lon and date range
- [ ] Wind speed + direction computed from u/v components
- [ ] Downloaded data auto-imported as a reference dataset in the project
- [ ] Progress indication works during download
- [ ] API key configuration is documented

**Stopping Point**: Can download ERA5/MERRA-2 data from the UI, auto-imported as reference datasets for MCP.

---

### Task 25: Data Reconstruction / Gap Filling
**Phase**: Long-Term Adjustment  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Implement data gap filling using KNN and linear interpolation methods.

**Files to Create/Modify**:
- `backend/app/services/data_reconstruction.py` (new)
- `backend/app/api/qc.py` (add reconstruction endpoint)
- `frontend/src/components/qc/GapFillPanel.tsx` (new)
- `frontend/src/pages/QCPage.tsx` (integrate)

**Implementation Details**:
1. Create `services/data_reconstruction.py`:
   - `identify_gaps(series: pd.Series, expected_step: timedelta) -> list[dict]`:
     - Find all gaps (NaN sequences or missing timestamps)
     - Return: `[{ start, end, duration, num_missing }]`
   - `fill_linear_interpolation(series: pd.Series, max_gap_hours: int = 6) -> pd.Series`:
     - Only fill gaps shorter than max_gap_hours
   - `fill_knn(target_series: pd.Series, predictor_df: pd.DataFrame, n_neighbors: int = 5) -> pd.Series`:
     - Use scikit-learn KNeighborsRegressor
     - Predictors: other sensors at the same site, time features (hour, month)
     - Train on non-NaN timestamps, predict NaN timestamps
   - `fill_correlation(target_series: pd.Series, reference_series: pd.Series) -> pd.Series`:
     - Use linear regression from a correlated dataset
   - `reconstruction_report(original, filled) -> dict`:
     - % of data filled, method used per gap, before/after statistics
2. **Backend**: `POST /api/qc/reconstruct/{dataset_id}`:
   - Accept: `column_id`, `method` ('interpolation', 'knn', 'correlation'), `params`
   - Return: filled series + reconstruction report
   - Option to save as a new column or overwrite (with undo support)
3. **Frontend**: Create `GapFillPanel.tsx`:
   - Gap inventory table: list of all gaps with start, end, duration
   - Method selector per gap or globally
   - Preview: time series chart showing original + filled data in different colors
   - Confirm → apply reconstruction

**Acceptance Criteria**:
- [ ] Gap identification works correctly
- [ ] Linear interpolation fills short gaps
- [ ] KNN fills gaps using correlated sensors
- [ ] Correlation-based filling works with reference datasets
- [ ] Reconstruction report shows what was filled
- [ ] Preview before committing changes

**Stopping Point**: Can identify gaps, fill using multiple methods, preview results, and commit reconstruction.

---

### Task 26: Energy Production Estimates
**Phase**: Energy & Advanced  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 16, 17

**Objective**: Implement power curve import and gross energy production estimation.

**Files to Create/Modify**:
- `backend/app/services/energy_estimate.py` (new)
- `backend/app/api/analysis.py` (add energy endpoints)
- `frontend/src/components/energy/PowerCurveEditor.tsx`
- `frontend/src/components/energy/EnergyEstimatePanel.tsx`
- `frontend/src/pages/EnergyPage.tsx`
- `data/sample_power_curve.csv` (sample turbine data)

**Implementation Details**:
1. Create sample power curve CSV (e.g., generic 3MW turbine):
   - Columns: wind_speed_ms, power_kw
   - Range: 0–25 m/s in 0.5 m/s steps
2. Create `services/energy_estimate.py`:
   - `load_power_curve(file_path_or_data: str | dict) -> pd.DataFrame`
   - `apply_power_curve(speeds: np.ndarray, power_curve: pd.DataFrame) -> np.ndarray`:
     - Interpolate power curve to match each wind speed value
   - `gross_energy_estimate(speeds, power_curve, density?, air_density_adjustment=True) -> dict`:
     - Apply power curve to wind speed time series
     - Optionally adjust for air density (IEC method: power scales with density ratio)
     - Return: annual gross energy (MWh), capacity factor, equivalent full-load hours
   - `energy_by_month(speeds, power_curve) -> dict`
   - `energy_by_speed_bin(speeds, power_curve) -> dict` — contribution by speed bin
3. **Backend endpoints**:
   - `POST /api/analysis/power-curve/upload` — upload and parse a power curve file
   - `POST /api/analysis/energy-estimate/{dataset_id}` — compute energy using stored wind data
4. **Frontend**:
   - `PowerCurveEditor.tsx`: upload CSV or manually enter speed/power pairs, display curve chart
   - `EnergyEstimatePanel.tsx`: select speed column (ideally hub-height), select power curve, run estimate
     - Display: annual energy, capacity factor, monthly energy bar chart, energy by speed bin chart

**Acceptance Criteria**:
- [ ] Power curve upload and display works
- [ ] Gross energy calculated correctly
- [ ] Air density adjustment applied
- [ ] Monthly energy breakdown displayed
- [ ] Capacity factor and full-load hours calculated
- [ ] Energy contribution by speed bin visualized

**Stopping Point**: Can upload power curves, estimate energy production, view monthly breakdown and key metrics.

---

### Task 27: Scatterplots & Polar Scatterplots
**Phase**: Energy & Advanced  
**Estimated Time**: 1 day  
**Dependencies**: Task 14

**Objective**: Build generic scatterplot and polar scatterplot visualization components.

**Files to Create/Modify**:
- `backend/app/api/analysis.py` (add scatter endpoint)
- `frontend/src/components/analysis/ScatterPlot.tsx`
- `frontend/src/components/analysis/PolarScatterPlot.tsx` (new)
- `frontend/src/pages/AnalysisPage.tsx` (add Scatter tab)

**Implementation Details**:
1. **Backend**: `POST /api/analysis/scatter/{dataset_id}`:
   - Accept: `x_column_id`, `y_column_id`, `color_column_id?`, `exclude_flags?`
   - Return paired data arrays (downsampled if > 10,000 points using random sampling)
2. **Frontend**: Create `ScatterPlot.tsx` using Plotly.js:
   - X/Y column selectors (any data column)
   - Optional color-by column (e.g., color by direction, by month)
   - Regression line overlay with equation
   - Density heatmap mode for large datasets (switch from dots to hex bins)
   - Zoom, pan, reset
3. **Frontend**: Create `PolarScatterPlot.tsx`:
   - Direction on angular axis, speed (or any value) on radial axis
   - Points colored by a third variable (e.g., TI, temperature)
   - Useful for visualizing speed-direction relationships

**Acceptance Criteria**:
- [ ] Scatterplot renders for any two columns
- [ ] Color-by-column works
- [ ] Regression line with R² displayed
- [ ] Handles large datasets via downsampling or density mode
- [ ] Polar scatterplot renders correctly
- [ ] Axis labels and units displayed

**Stopping Point**: Scatter and polar scatter visualizations work with any column pair and color coding.

---

### Task 28: Daily & Monthly Profile Plots
**Phase**: Energy & Advanced  
**Estimated Time**: 1 day  
**Dependencies**: Task 12

**Objective**: Build diurnal (hourly average) and seasonal (monthly average) profile visualizations.

**Files to Create/Modify**:
- `backend/app/api/analysis.py` (add profile endpoints)
- `frontend/src/components/analysis/ProfilePlots.tsx` (new)
- `frontend/src/pages/AnalysisPage.tsx` (add Profiles tab)

**Implementation Details**:
1. **Backend**: `POST /api/analysis/profiles/{dataset_id}`:
   - Accept: `column_id`, `exclude_flags?`
   - Compute:
     - **Diurnal profile**: hourly mean, std, min, max across all days (24 data points)
     - **Monthly profile**: monthly mean, std, min, max (12 data points)
     - **Monthly-diurnal heatmap**: 12×24 matrix of averages
   - Return all three datasets
2. **Frontend**: Create `ProfilePlots.tsx`:
   - **Diurnal tab**: line chart (0-23 hours on X), mean line with std shading
   - **Monthly tab**: bar chart (Jan-Dec), mean with error bars
   - **Heatmap tab**: 12×24 color-coded grid (months × hours), color = value intensity
   - Column selector
   - Option to overlay multiple years (for inter-annual comparison)

**Acceptance Criteria**:
- [ ] Diurnal profile shows correct hourly averages with variability bands
- [ ] Monthly profile shows correct monthly averages
- [ ] Monthly-diurnal heatmap renders with meaningful color scale
- [ ] Respects flag exclusions
- [ ] Column selector works for any data column

**Stopping Point**: All three profile visualizations work (diurnal, monthly, heatmap) for any data column.

---

### Task 29: Export Engine — WAsP TAB, CSV, IEA JSON
**Phase**: Export & Reports  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 14, 16

**Objective**: Build the export system supporting WAsP TAB files, cleaned CSV, and IEA Task 43 JSON.

**Files to Create/Modify**:
- `backend/app/services/export_engine.py`
- `backend/app/api/export.py`
- `backend/app/main.py` (register router)
- `frontend/src/components/export/ExportWizard.tsx`
- `frontend/src/pages/ExportPage.tsx`

**Implementation Details**:
1. Create `services/export_engine.py`:
   - `export_csv(dataset_id, columns?, exclude_flags?, resample?) -> bytes`:
     - Clean CSV of selected columns with flag filtering
   - `export_wasp_tab(dataset_id, speed_column, direction_column, exclude_flags?) -> str`:
     - WAsP TAB format: header line, then sectors × speed_bins frequency table
     - Sectors: 12 (30° each), speed bins: 1 m/s from 0 to max
     - Include Weibull A and k per sector
     - Include overall frequency per sector
   - `export_iea_json(dataset_id, exclude_flags?) -> dict`:
     - Follow IEA Wind Task 43 WRA Data Model schema
     - Include metadata, measurement configuration, time series data
   - `export_openwind(dataset_id, ...) -> str`:
     - Openwind time series format
2. **Backend**: Create `api/export.py` with prefix `/api/export`:
   - `POST /csv/{dataset_id}` → returns CSV file download
   - `POST /wasp-tab/{dataset_id}` → returns TAB file download
   - `POST /iea-json/{dataset_id}` → returns JSON file download
   - All endpoints return `StreamingResponse` with appropriate content type
3. **Frontend**: Create `ExportWizard.tsx`:
   - Format selector: CSV, WAsP TAB, IEA JSON, Openwind
   - For each format, show relevant options:
     - CSV: column selection, resample, flag filter
     - TAB: speed column, direction column, number of sectors
   - Preview panel showing first few lines of output
   - Download button

**Acceptance Criteria**:
- [ ] CSV export with flag filtering works
- [ ] WAsP TAB file generated with correct format (validated against spec)
- [ ] IEA Task 43 JSON export works
- [ ] Export wizard guides user through options
- [ ] Downloaded files are correctly formatted
- [ ] Correct MIME types and filenames in response headers

**Stopping Point**: Three export formats work, downloadable from the UI with format-specific options.

---

### Task 30: Report Generation (Word/PDF)
**Phase**: Export & Reports  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 14–20

**Objective**: Generate comprehensive wind resource assessment reports in Word (DOCX) and PDF formats.

**Files to Create/Modify**:
- `backend/app/services/report_generator.py`
- `backend/app/api/reports.py`
- `backend/app/main.py` (register router)
- `frontend/src/components/export/ReportGenerator.tsx`
- `backend/app/services/report_templates/` (new directory)

**Implementation Details**:
1. Create `services/report_generator.py`:
   - Use `python-docx` for Word generation
   - Generate report sections:
     1. **Title page**: project name, location, date, author
     2. **Executive summary**: key metrics (mean speed, Weibull params, energy estimate)
     3. **Site description**: lat/lon, elevation, measurement setup
     4. **Data summary**: date range, recovery %, sensors table
     5. **QC summary**: flags applied, data removed %
     6. **Wind rose**: embedded image (generated server-side with matplotlib/windrose)
     7. **Frequency distribution**: histogram + Weibull overlay image
     8. **Wind shear**: vertical profile image, shear table
     9. **Turbulence**: TI by speed bin image, IEC class
     10. **Long-term adjustment**: MCP results, method comparison table
     11. **Energy estimate**: annual energy, capacity factor, monthly breakdown
   - Each section is optional / configurable
   - `generate_report(project_id, sections: list[str], format: 'docx' | 'pdf') -> bytes`
   - For PDF: use WeasyPrint to convert HTML template to PDF
2. Server-side chart generation using matplotlib:
   - `generate_chart_image(chart_type, data, options) -> bytes (PNG)`
   - Reuse analysis service functions for data, matplotlib for rendering
3. **Backend**: `POST /api/reports/generate/{project_id}`:
   - Accept: sections list, format, dataset_id
   - Return: file download
4. **Frontend**: Create `ReportGenerator.tsx`:
   - Checklist of report sections to include
   - Format selector: Word, PDF
   - "Generate Report" button with progress
   - Download when ready

**Acceptance Criteria**:
- [ ] Word report generates with all selected sections
- [ ] PDF report generates correctly
- [ ] Embedded charts are legible and properly sized
- [ ] Report includes correct data (matches UI analysis)
- [ ] Section selection works (include/exclude specific sections)
- [ ] Report is professionally formatted

**Stopping Point**: Full report generation in DOCX and PDF with configurable sections and embedded charts.

---

### Task 31: Multi-Step Undo / Change History
**Phase**: Polish  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 10, 12

**Objective**: Implement a change history system that tracks all data modifications and supports undo.

**Files to Create/Modify**:
- `backend/app/models/change_log.py` (new)
- `backend/app/services/history.py` (new)
- `backend/app/api/datasets.py` (add undo endpoints)
- `backend/alembic/versions/` (new migration)
- `frontend/src/components/common/HistoryPanel.tsx` (new)

**Implementation Details**:
1. Create `models/change_log.py`:
   - `ChangeLog(id, dataset_id, action_type, description, before_state JSON, after_state JSON, created_at)`
   - Action types: 'flag_applied', 'flag_removed', 'data_reconstructed', 'column_added', 'data_imported'
2. Create `services/history.py`:
   - `record_change(dataset_id, action, description, before, after)` — called by all data-modifying operations
   - `undo_last(dataset_id) -> ChangeLog` — revert the most recent change
   - `get_history(dataset_id) -> list[ChangeLog]` — ordered history
3. Integrate `record_change` calls into:
   - QC engine (flag application, flag removal)
   - Data reconstruction (gap filling)
   - Column creation (shear extrapolation)
4. **Frontend**: `HistoryPanel.tsx`:
   - Timeline view of all changes
   - "Undo" button on each change
   - Accessible from project page sidebar

**Acceptance Criteria**:
- [ ] All data modifications are logged
- [ ] Undo reverts the last change correctly
- [ ] History displays in chronological order
- [ ] Undo works for flag operations and data reconstruction

**Stopping Point**: Change history is tracked for all operations, undo works for the most recent change.

---

### Task 32: Automated Workflows Engine
**Phase**: Polish  
**Estimated Time**: 1 day  
**Dependencies**: Tasks 10, 17, 21, 25

**Objective**: Build a simple workflow automation system that chains analysis steps.

**Files to Create/Modify**:
- `backend/app/services/workflow_engine.py` (new)
- `backend/app/models/workflow.py` (new)
- `backend/app/api/workflows.py` (new)
- `frontend/src/components/workflows/WorkflowBuilder.tsx` (new)
- `frontend/src/pages/WorkflowsPage.tsx` (new)

**Implementation Details**:
1. Create `models/workflow.py`:
   - `Workflow(id, project_id, name, steps JSON, status, last_run, created_at)`
   - Steps format: `[{ step_type, params, order }]`
2. Available step types:
   - `import_file` — import a specific file
   - `apply_qc_rules` — apply all flag rules for a dataset
   - `reconstruct_gaps` — fill gaps using specified method
   - `calculate_shear` — compute shear and extrapolate
   - `run_mcp` — long-term adjustment with specified reference
   - `generate_report` — create report
   - `export_data` — export in specified format
3. Create `services/workflow_engine.py`:
   - `run_workflow(workflow_id) -> dict`:
     - Execute steps sequentially
     - Log each step's result
     - Stop on error with clear error message
     - Return execution summary
4. **Frontend**: `WorkflowBuilder.tsx`:
   - Drag-and-drop step builder
   - Configure each step's parameters
   - Run button with step-by-step progress display
   - Execution log viewer

**Acceptance Criteria**:
- [ ] Can define a multi-step workflow
- [ ] Workflow executes steps in order
- [ ] Each step uses the correct service function
- [ ] Errors in one step halt the workflow with clear message
- [ ] Execution log is viewable

**Stopping Point**: Can define and run a simple multi-step workflow that chains analysis operations.

---

### Task 33: KML Export & Geospatial Features
**Phase**: Polish  
**Estimated Time**: 1 day  
**Dependencies**: Task 3

**Objective**: Add KML export for project/dataset locations and a simple map view.

**Files to Create/Modify**:
- `backend/app/services/export_engine.py` (add KML)
- `backend/app/api/export.py` (add KML endpoint)
- `frontend/src/components/projects/ProjectMap.tsx` (new)
- `frontend/src/pages/DashboardPage.tsx` (integrate map)

**Implementation Details**:
1. **Backend**: Add `export_kml(project_ids: list) -> str`:
   - Use `simplekml` library
   - Create placemarks for each project (lat/lon)
   - Include metadata: project name, mean speed, elevation
2. **Frontend**: `ProjectMap.tsx`:
   - Embed a simple map (Leaflet + OpenStreetMap tiles)
   - Show markers for all projects with lat/lon
   - Click marker → navigate to project
3. Add map view to the DashboardPage alongside the project list

**Acceptance Criteria**:
- [ ] KML file downloads with project locations
- [ ] Map displays project markers
- [ ] Marker click navigates to project
- [ ] Map is responsive and loads tiles correctly

**Stopping Point**: KML export works, project map displays on the dashboard.

---

### Task 34: Comprehensive Testing & Bug Fixes
**Phase**: Polish  
**Estimated Time**: 1 day  
**Dependencies**: All previous tasks

**Objective**: Write comprehensive tests, fix any bugs found, and ensure all features work end-to-end.

**Files to Create/Modify**:
- `backend/tests/test_import.py`
- `backend/tests/test_qc.py`
- `backend/tests/test_analysis.py`
- `backend/tests/test_mcp.py`
- `backend/tests/test_export.py`
- `backend/tests/test_energy.py`
- `frontend/src/__tests__/` (component tests if time permits)

**Implementation Details**:
1. Write/expand backend tests:
   - **Import**: CSV, Excel, NRG, Campbell parsing with edge cases (empty files, missing columns, wrong delimiters)
   - **QC**: Flag creation, rule application, filtering, tower shadow
   - **Analysis**: Weibull fit accuracy, shear calculation, TI, air density, extreme wind
   - **MCP**: All three methods with known synthetic data, verify against expected results
   - **Export**: Validate CSV, TAB, JSON output formats
   - **Energy**: Power curve application, energy calculation
2. Create synthetic test datasets with known statistical properties:
   - Known Weibull distribution (k=2.0, A=7.0) → verify fit recovers parameters
   - Known shear profile (alpha=0.2) → verify extrapolation
   - Known MCP relationship → verify prediction
3. Fix all bugs found during testing
4. Run full test suite: `pytest -v --tb=short`

**Acceptance Criteria**:
- [ ] All backend tests pass
- [ ] Test coverage > 70% for services/ directory
- [ ] Known-value tests validate analytical correctness
- [ ] No critical bugs remaining
- [ ] Edge cases handled (empty data, NaN-heavy data, single data point)

**Stopping Point**: Full test suite passes, major bugs fixed, analytical functions validated against known values.

---

### Task 35: Docker Deployment & Documentation
**Phase**: Polish  
**Estimated Time**: 1 day  
**Dependencies**: All previous tasks

**Objective**: Containerize the full application and write user/developer documentation.

**Files to Create/Modify**:
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml` (complete with all services)
- `nginx.conf` (reverse proxy)
- `README.md` (full rewrite)
- `docs/api.md`
- `docs/user-guide.md`
- `.github/workflows/ci.yml` (GitHub Actions)

**Implementation Details**:
1. **Backend Dockerfile**: Multi-stage build, Python 3.11, install deps, copy app, run with uvicorn
2. **Frontend Dockerfile**: Build stage (node:20, npm build) → serve with nginx
3. **docker-compose.yml**: 
   - PostgreSQL 15
   - Redis (for task queue)
   - Backend (FastAPI)
   - Frontend (nginx serving React build)
   - Volumes for data persistence
4. **nginx.conf**: Reverse proxy `/api` → backend, `/` → frontend
5. **README.md**: Project overview, screenshots, quick start (docker-compose up), development setup, architecture overview, contributing guide
6. **docs/api.md**: Full API reference (can auto-generate from FastAPI OpenAPI spec)
7. **docs/user-guide.md**: Walkthrough of main workflows (import → QC → analysis → MCP → export)
8. **GitHub Actions CI**: Run tests on push, lint check, build Docker images

**Acceptance Criteria**:
- [ ] `docker-compose up` starts the entire application
- [ ] Application is accessible at `http://localhost:3000`
- [ ] API is proxied correctly at `http://localhost:3000/api`
- [ ] README has clear setup instructions
- [ ] CI pipeline runs tests on push
- [ ] API documentation is accessible

**Stopping Point**: Application runs in Docker, documentation is complete, CI is configured. Project is ready for public use.

---

## Appendix A: Sample Data Column Naming Conventions

For auto-detection, the parser should recognize these patterns:

| Pattern | Measurement Type | Example |
|---------|-----------------|---------|
| `speed`, `ws`, `vel`, `windspd` | Wind Speed | Speed_80m, WS_60, Vel40 |
| `dir`, `wd`, `winddir` | Wind Direction | Dir_80m, WD_60 |
| `sd`, `std`, `stdev`, `sigma` | Standard Deviation | Speed_SD_80m, WS_60_std |
| `ti` | Turbulence Intensity | TI_80m |
| `temp`, `t_` | Temperature | Temp_2m, T_screen |
| `press`, `bp`, `baro` | Pressure | Press_hPa, BP |
| `rh`, `humid` | Relative Humidity | RH_2m |
| `gust`, `max` | Gust Speed | Gust_80m, WS_max_60 |
| `solar`, `ghi`, `radiation` | Solar Radiation | GHI, Solar_W |
| `rain`, `precip` | Precipitation | Rain_mm |
| Height extraction | `(\d+)\s*m` | "Speed_80m" → 80 |

## Appendix B: WAsP TAB File Format Reference

```
Station: <name>
<lat> <lon> <elevation> <anemometer_height>
<num_sectors> <num_speed_bins>
<sector_1_freq> <bin_1_count> <bin_2_count> ... <weibull_A> <weibull_k>
<sector_2_freq> <bin_1_count> <bin_2_count> ... <weibull_A> <weibull_k>
...
```

## Appendix C: Key Formulas

| Calculation | Formula |
|-------------|---------|
| Turbulence Intensity | TI = σ_u / U |
| Power Law Shear | α = ln(v₂/v₁) / ln(z₂/z₁) |
| Log Law Roughness | z₀ = exp((v₁·ln(z₂) - v₂·ln(z₁)) / (v₁ - v₂)) |
| Power Law Extrapolation | v₂ = v₁ × (z₂/z₁)^α |
| Air Density | ρ = P / (R_d × T_K), R_d = 287.05 J/(kg·K) |
| Wind Power Density | WPD = ½ × ρ × v³ |
| Weibull PDF | f(v) = (k/A)(v/A)^(k-1) × exp(-(v/A)^k) |
| Gumbel Return Period | V_T = μ - β × ln(-ln(1 - 1/T)) |
| MCP Linear | v_site = a × v_ref + b |
| MCP Variance Ratio | v_site = μ_site + (v_ref - μ_ref) × (σ_site/σ_ref) |

---

*This specification was generated from comprehensive research on Windographer by UL Solutions. WindWhisper is an independent, open-source project and is not affiliated with Windographer or UL Solutions.*
