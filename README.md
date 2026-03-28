# GoKaatru 🌬️

**GoKaatru** is a comprehensive, open-source web application for **Wind Resource Assessment (WRA)**. It covers the full workflow — from importing raw met-tower data through quality control, advanced analysis (shear, turbulence, Weibull, extreme wind), long-term correction (MCP), energy estimation, and professional report generation — all with transparency and reproducibility.

---

## Features

| Category | Capabilities |
|---|---|
| **Data Import** | CSV, NRG Systems, Campbell Scientific (TOA5), Excel; auto-delimiter detection; column-type auto-detection |
| **Quality Control** | Range / spike / flat-line rules; manual & automatic flagging; tower-shadow correction; undo/redo history |
| **Analysis** | Wind rose, frequency histogram, Weibull fit (MLE & moments), wind shear (power & log law), turbulence intensity (IEC classification), air density, extreme wind (Gumbel), wind profiles |
| **MCP** | Linear regression, variance ratio, matrix method; correlate / predict / compare |
| **Energy** | Power-curve library, gross AEP, density-adjusted AEP, monthly & speed-bin breakdowns |
| **Data Reconstruction** | Linear interpolation, KNN imputation, correlation-based fill |
| **Export** | CSV, WAsP TAB, IEA JSON, OpenWind CSV, KML site map |
| **Reports** | PDF & DOCX generation with selectable sections |
| **Workflows** | Save and replay multi-step processing pipelines |
| **Notifications** | Real-time toast notifications for long-running tasks |
| **Maps** | Interactive Leaflet map for project sites |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    nginx  (:3000)                         │
│   /api/*  ──►  FastAPI backend  (:8000)                  │
│   /*      ──►  React SPA        (:80)                    │
└──────────────────────────────────────────────────────────┘
         │                           │
    PostgreSQL (:5432)          Redis (:6379)
```

- **Frontend** — React 18 · Vite · TypeScript · TailwindCSS · Plotly.js · Leaflet
- **Backend** — FastAPI · Python 3.11+ · SQLAlchemy (async) · Pandas · SciPy · scikit-learn
- **Database** — PostgreSQL 15
- **Cache / Queue** — Redis 7

---

## Quick Start (Docker)

The fastest way to run GoKaatru — no language runtimes needed, just Docker.

```bash
git clone https://github.com/coderenewables/GoKaatru.git
cd GoKaatru
docker compose up --build -d
```

Once all containers are healthy the application is available at:

| URL | Description |
|---|---|
| **http://localhost:3000** | Application (nginx proxy) |
| **http://localhost:3000/api/health** | API health check |
| **http://localhost:3000/docs** | Swagger / OpenAPI explorer |

To stop:

```bash
docker compose down
```

To also remove persisted data volumes:

```bash
docker compose down -v
```

---

## Development Setup

For day-to-day development you can run each service directly on your machine.

### Prerequisites

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for PostgreSQL)
- [Node.js](https://nodejs.org/) v18+
- [Miniconda / Anaconda](https://docs.conda.io/en/latest/miniconda.html)

### 1. Clone & Start the Database

```bash
git clone https://github.com/coderenewables/GoKaatru.git
cd GoKaatru

# Start only PostgreSQL (and optionally Redis)
docker compose up postgres redis -d
```

### 2. Backend (FastAPI)

```bash
cd backend

# Create and activate Conda environment
conda create -n gokaatru python=3.11 -y
conda activate gokaatru

# Install dependencies (editable mode)
pip install -e ".[dev]"

# Run database migrations
alembic upgrade head

# Start the dev server (auto-reload)
uvicorn app.main:app --reload
```

The API is now at **http://localhost:8000** with Swagger docs at **http://localhost:8000/docs**.

> **Windows / PowerShell note:** If `conda activate` doesn't work, load the Conda hook first:
> ```powershell
> . "C:\ProgramData\anaconda3\shell\condabin\conda-hook.ps1"
> conda activate gokaatru
> ```

### 3. Frontend (React / Vite)

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

The frontend is at **http://localhost:5173** and proxies `/api` requests to the backend automatically.

### 4. Running Tests

**Backend tests** (requires a running PostgreSQL with a `gokaatru_test` database):

```bash
cd backend
conda activate gokaatru
python -m pytest tests/ -v
```

**Frontend tests:**

```bash
cd frontend
npm test
```

---

## Project Structure

```
GoKaatru/
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml          # Python dependencies & build config
│   ├── alembic.ini             # Database migration settings
│   ├── alembic/                # Migration scripts
│   ├── app/
│   │   ├── main.py             # FastAPI application entry point
│   │   ├── config.py           # Settings (env-driven)
│   │   ├── database.py         # Async SQLAlchemy engine
│   │   ├── api/                # Route handlers
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Business logic & computation
│   │   └── utils/              # Shared helpers
│   ├── scripts/                # Data generation utilities
│   └── tests/                  # pytest test suite
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/                # Axios API client modules
│       ├── components/         # React components (by domain)
│       ├── hooks/              # Custom React hooks
│       ├── pages/              # Page-level components
│       ├── stores/             # Zustand state stores
│       └── types/              # TypeScript type definitions
├── data/                       # Sample data files
├── docs/                       # Documentation
│   ├── api.md                  # API reference
│   └── user-guide.md           # User walkthrough
├── docker-compose.yml          # Full-stack Docker orchestration
├── nginx.conf                  # Reverse proxy configuration
├── .github/workflows/ci.yml   # GitHub Actions CI pipeline
├── SPECIFICATIONS.md           # Detailed project specification
└── README.md                   # This file
```

---

## Environment Variables

The backend reads settings from environment variables (or a `.env` file in `backend/`):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://windwhisper:windwhisper@localhost:5432/windwhisper` | Async database connection string |
| `CORS_ORIGINS` | `["http://localhost:5173","http://127.0.0.1:5173"]` | Allowed CORS origins (JSON array) |
| `DEBUG` | `false` | Enable debug mode & verbose SQL logging |
| `APP_VERSION` | `0.1.0` | Reported API version |

---

## API Overview

All endpoints are prefixed with `/api`. Full reference: [docs/api.md](docs/api.md).

| Group | Prefix | Description |
|---|---|---|
| Projects | `/api/projects` | CRUD for wind assessment projects |
| Import | `/api/import` | Upload & confirm data files |
| Datasets | `/api/datasets` | List datasets, get timeseries, manage columns |
| QC | `/api/qc` | Flags, rules, tower-shadow, reconstruction |
| Analysis | `/api/analysis` | Wind rose, histogram, Weibull, shear, turbulence, air density, extreme wind, energy, profiles, scatter |
| MCP | `/api/mcp` | Correlate, predict, compare reference data |
| Export | `/api/export` | CSV, WAsP TAB, IEA JSON, OpenWind, KML |
| Reports | `/api/reports` | Generate PDF / DOCX reports |
| Workflows | `/api/workflows` | Create, run & manage automation pipelines |

Interactive API documentation is available at `/docs` (Swagger UI) and `/redoc` (ReDoc) when the backend is running.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please ensure all tests pass before submitting a PR. The CI pipeline will run automatically on every push.

---

## License

This project is open-source. See [LICENSE](LICENSE) for details.

---

*GoKaatru is an independent, open-source project for wind resource assessment.*

---

## Core Features
* **Import Wizard:** Upload meteorological towers datasets (CSV/Excel/NRG).
* **Quality Control:** Automated and manual flagging rules for erroneous or suspicious data.
* **Detailed Analytics:** Compute air density, wind shear, turbulence intensity, and Weibull fits.
* **Interactive Visualizations:** Time-series charts, wind roses, scatterplots, and frequency histograms.

## Contributing
GoKaatru is totally open-source and welcomes contributions! Please feel free to check our open issues, submit pull requests, or share your ideas on how to improve wind resource assessment tooling. 

## License
This project is licensed under the [Apache 2.0 License](LICENSE).