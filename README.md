# WindWhisper 🌬️

WindWhisper is a comprehensive, open-source web application for wind resource assessment, built to rival proprietary solutions in the industry. It covers the full Wind Resource Assessment (WRA) workflow including importing raw data, performing Quality Control (QC), analyzing metrics (shear, turbulence, Weibull), adjusting long-term measurements, and visualizing the data.

## Project Architecture

The application is a full-stack web app:
- **Frontend:** React 18, Vite, TypeScript, and TailwindCSS rendering interactive visualizations (Recharts, Plotly.js).
- **Backend:** FastAPI (Python 3.11+) powering heavy computation (MCP, shear extrapolation, data reconstruction).
- **Database:** PostgreSQL storing projects, datasets, metadata, and TimeSeries data.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/en) (v18 or higher recommended)
- [Miniconda / Anaconda](https://docs.conda.io/en/latest/miniconda.html) for Python environment management
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (to easily spin up PostgreSQL)
- Git

### 1. Clone the repository

```bash
git clone https://github.com/coderenewables/wind-resource.git
cd wind-resource
```

### 2. Set up the Database

We use Docker to quickly run local PostgreSQL.

```bash
# Start PostgreSQL database in the background
docker-compose up -d
```

### 3. Set up the Backend (FastAPI)

We recommend using a dedicated Conda environment named `windwhisper` to isolate Python dependencies.

```bash
# Navigate to the backend directory
cd backend

# Create and activate a conda environment with Python 3.11
conda create -n windwhisper python=3.11 -y
conda activate windwhisper

# Install the dependencies
pip install -e .

# Run database migrations to set up your tables
alembic upgrade head

# Start the FastApi backend server
uvicorn app.main:app --reload
```
*The backend API will be available at http://localhost:8000. You can view the automated Swagger docs at http://localhost:8000/docs.*

*Note for Windows/PowerShell users:* If `conda activate windwhisper` doesn't work out of the box, ensure you initialize the Conda hook first:
`. "C:\ProgramData\anaconda3\shell\condabin\conda-hook.ps1"`

### 4. Set up the Frontend (React / Vite)

Open a new terminal window to keep your backend server running, then navigate to your frontend directory.

```bash
# Navigate to the frontend directory
cd frontend

# Install the frontend dependencies
npm install

# Start the development server
npm run dev
```
*The frontend application will be hosted locally at http://localhost:5173.*

---

## Core Features
* **Import Wizard:** Upload meteorological towers datasets (CSV/Excel/NRG).
* **Quality Control:** Automated and manual flagging rules for erroneous or suspicious data.
* **Detailed Analytics:** Compute air density, wind shear, turbulence intensity, and Weibull fits.
* **Interactive Visualizations:** Time-series charts, wind roses, scatterplots, and frequency histograms.

## Contributing
WindWhisper is totally open-source and welcomes contributions! Please feel free to check our open issues, submit pull requests, or share your ideas on how to improve wind resource assessment tooling. 

## License
This project is licensed under the [Apache 2.0 License](LICENSE).