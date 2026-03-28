# GoKaatru API Reference

> **Base URL**: `http://localhost:8000` (development) or `http://localhost:3000` (Docker)
>
> Interactive docs are available at `/docs` (Swagger UI) and `/redoc` (ReDoc).

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{"status":"ok","version":"..."}` |

---

## Projects — `/api/projects`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects` | List projects (paginated: `skip`, `limit`) |
| GET | `/api/projects/{project_id}` | Get project details (includes dataset count) |
| PUT | `/api/projects/{project_id}` | Update project fields |
| DELETE | `/api/projects/{project_id}` | Delete project and all related data |

### Create Project

```
POST /api/projects
Content-Type: application/json
```

```json
{
  "name": "My Wind Farm",
  "description": "Met tower east of ridge line",
  "latitude": 52.5,
  "longitude": -1.9,
  "elevation": 120
}
```

---

## Import — `/api/import`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/import/upload/{project_id}` | Upload a file and get a preview (auto-detects format, delimiter, and column types) |
| GET | `/api/import/sheets/{project_id}` | List sheet names in an uploaded Excel workbook |
| POST | `/api/import/confirm/{project_id}` | Confirm import — persists dataset and timeseries |

### Upload

```
POST /api/import/upload/{project_id}
Content-Type: multipart/form-data
```

Form field: `file` — CSV, TXT, DAT, or XLSX file.

Optional query parameter: `sheet_name` (for Excel files).

Returns a preview with detected columns, types, units, and heights.

### Confirm

```
POST /api/import/confirm/{project_id}
Content-Type: application/json
```

```json
{
  "import_id": "<from upload response>",
  "dataset_name": "Met Tower 2024",
  "columns": [
    {
      "original_name": "Speed_80m",
      "display_name": "Wind Speed 80 m",
      "measurement_type": "speed",
      "unit": "m/s",
      "height_m": 80,
      "include": true
    }
  ]
}
```

---

## Datasets — `/api`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/{project_id}/datasets` | List datasets in a project |
| GET | `/api/datasets/{dataset_id}` | Get dataset metadata and column definitions |
| GET | `/api/datasets/{dataset_id}/timeseries` | Get timeseries rows (supports `start`, `end`, `columns`, `resample`, `exclude_flags`) |
| GET | `/api/datasets/{dataset_id}/history` | Get changelog of modifications |
| POST | `/api/datasets/{dataset_id}/undo` | Undo the last change |

### Timeseries Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | ISO datetime | Filter rows after this time |
| `end` | ISO datetime | Filter rows before this time |
| `columns` | comma-separated | Column IDs to include |
| `resample` | string | Pandas resample rule (e.g. `1h`, `1D`) |
| `exclude_flags` | comma-separated | Flag IDs whose ranges should be NaN-masked |

---

## Quality Control — `/api/qc`

### Flags

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/qc/flags/{dataset_id}` | Create a flag category |
| GET | `/api/qc/flags/{dataset_id}` | List flags for a dataset |
| DELETE | `/api/qc/flags/{flag_id}` | Delete flag and its ranges |

### Rules (automatic flagging)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/qc/flags/{flag_id}/rules` | Add a rule to a flag |
| GET | `/api/qc/flags/{flag_id}/rules` | List rules for a flag |
| PUT | `/api/qc/rules/{rule_id}` | Update a rule |
| DELETE | `/api/qc/rules/{rule_id}` | Delete a rule |
| POST | `/api/qc/flags/{flag_id}/apply-rules` | Apply all rules and generate ranges |

### Manual Flagging

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/qc/flags/{flag_id}/manual` | Manually flag a time range |
| GET | `/api/qc/datasets/{dataset_id}/flagged-ranges` | List all flagged ranges |
| DELETE | `/api/qc/flagged-ranges/{range_id}` | Remove a flagged range |

### Tower Shadow & Reconstruction

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/qc/tower-shadow/{dataset_id}` | Detect/apply tower shadow flags |
| POST | `/api/qc/reconstruct/{dataset_id}` | Reconstruct missing data (interpolation, KNN, correlation) |

---

## Analysis — `/api/analysis`

All analysis endpoints accept `exclude_flags` to mask flagged data.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analysis/wind-rose/{dataset_id}` | Wind rose (sector frequencies, mean speeds) |
| POST | `/api/analysis/histogram/{dataset_id}` | Frequency histogram |
| POST | `/api/analysis/scatter/{dataset_id}` | Scatter plot (x vs y variable) |
| POST | `/api/analysis/weibull/{dataset_id}` | Weibull fit (MLE or moments method) |
| POST | `/api/analysis/shear/{dataset_id}` | Wind shear analysis (power law or log law) |
| POST | `/api/analysis/extrapolate/{dataset_id}` | Extrapolate speed to a target height (optionally creates a new column) |
| POST | `/api/analysis/turbulence/{dataset_id}` | Turbulence intensity (IEC classification) |
| POST | `/api/analysis/air-density/{dataset_id}` | Air density & wind power density |
| POST | `/api/analysis/extreme-wind/{dataset_id}` | Extreme wind (Gumbel, return periods) |
| POST | `/api/analysis/profiles/{dataset_id}` | Diurnal, monthly, yearly profiles |
| POST | `/api/analysis/energy-estimate/{dataset_id}` | Gross energy estimate (AEP) |

### Power Curve Library

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analysis/power-curve/upload` | Upload power curve CSV |
| GET | `/api/analysis/power-curves` | List saved power curves |
| POST | `/api/analysis/power-curves` | Save new power curve |
| PUT | `/api/analysis/power-curves/{curve_id}` | Update power curve |
| DELETE | `/api/analysis/power-curves/{curve_id}` | Delete power curve |

---

## MCP (Measure-Correlate-Predict) — `/api/mcp`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mcp/correlate` | Correlate site and reference datasets |
| POST | `/api/mcp/predict` | Predict long-term site conditions (linear, variance_ratio, matrix) |
| POST | `/api/mcp/compare` | Compare multiple MCP methods side by side |
| POST | `/api/mcp/download-reference` | Queue ERA5/MERRA2 reanalysis download |
| GET | `/api/mcp/download-status/{task_id}` | Check download task status |

### Correlate Request Example

```json
{
  "site_dataset_id": 1,
  "site_column_id": 5,
  "ref_dataset_id": 2,
  "ref_column_id": 10,
  "max_points": 5000
}
```

---

## Export — `/api/export`

All export endpoints return file downloads.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/export/csv/{dataset_id}` | CSV export (selected columns, resample, flag exclusion) |
| POST | `/api/export/wasp-tab/{dataset_id}` | WAsP TAB file |
| POST | `/api/export/iea-json/{dataset_id}` | IEA JSON exchange format |
| POST | `/api/export/openwind/{dataset_id}` | OpenWind CSV format |
| POST | `/api/export/kml` | KML file with project locations |

---

## Reports — `/api/reports`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reports/generate/{project_id}` | Generate PDF or DOCX report |

### Request Body

```json
{
  "dataset_id": 1,
  "sections": ["data_summary", "wind_rose", "frequency_distribution", "wind_shear"],
  "format": "pdf",
  "title": "Wind Assessment Report"
}
```

Available sections: `data_summary`, `wind_rose`, `frequency_distribution`, `wind_shear`, `turbulence`, `air_density`, `extreme_wind`, `energy_estimate`, `mcp_summary`.

---

## Workflows — `/api/workflows`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows/projects/{project_id}` | List workflows |
| POST | `/api/workflows/projects/{project_id}` | Create workflow |
| GET | `/api/workflows/{workflow_id}` | Get workflow details |
| PUT | `/api/workflows/{workflow_id}` | Update workflow |
| DELETE | `/api/workflows/{workflow_id}` | Delete workflow |
| POST | `/api/workflows/{workflow_id}/run` | Execute workflow |

### Step Types

| Type | Description |
|------|-------------|
| `import_file` | Import a data file into the project |
| `apply_qc_rules` | Create flags/rules and apply to dataset |
| `reconstruct_gaps` | Fill missing data (interpolation/KNN/correlation) |
| `calculate_shear` | Run shear analysis and extrapolate to target height |
| `run_mcp` | Execute MCP prediction |
| `generate_report` | Create PDF/DOCX report |
| `export_data` | Export dataset to CSV/WAsP/IEA/OpenWind |

### Create Workflow Example

```json
{
  "name": "Full Assessment Pipeline",
  "steps": [
    {
      "step_type": "import_file",
      "order": 0,
      "parameters": {
        "file_path": "data/sample_met_tower.csv",
        "dataset_name": "Met Tower"
      }
    },
    {
      "step_type": "apply_qc_rules",
      "order": 1,
      "parameters": {
        "flag_name": "Range Check",
        "rules": [
          {"column_type": "speed", "operator": "gt", "value": 50}
        ]
      }
    },
    {
      "step_type": "calculate_shear",
      "order": 2,
      "parameters": {
        "target_height": 100,
        "method": "power"
      }
    },
    {
      "step_type": "export_data",
      "order": 3,
      "parameters": {
        "format": "csv"
      }
    }
  ]
}
```

---

## Error Responses

All errors follow a consistent structure:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid parameters) |
| 404 | Resource not found |
| 422 | Validation error (Pydantic) |
| 500 | Internal server error |

---

## Authentication

GoKaatru currently runs without authentication. All endpoints are open. If deploying publicly, place the application behind an authentication proxy or VPN.
