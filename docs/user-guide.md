# GoKaatru User Guide

This guide walks through the main workflows in GoKaatru — from creating a project to generating a professional report.

---

## Table of Contents

1. [Creating a Project](#1-creating-a-project)
2. [Importing Data](#2-importing-data)
3. [Viewing Time Series](#3-viewing-time-series)
4. [Quality Control](#4-quality-control)
5. [Wind Analysis](#5-wind-analysis)
6. [MCP (Long-Term Correction)](#6-mcp-long-term-correction)
7. [Energy Estimation](#7-energy-estimation)
8. [Exporting Data](#8-exporting-data)
9. [Report Generation](#9-report-generation)
10. [Workflows (Automation)](#10-workflows-automation)

---

## 1. Creating a Project

Every analysis begins with a project. A project groups related datasets for a single site.

1. Navigate to the **Dashboard** page.
2. Click **New Project**.
3. Fill in:
   - **Name** — e.g. "Ridge Farm Met Tower"
   - **Description** — optional notes
   - **Latitude / Longitude** — site coordinates (used for maps and reanalysis downloads)
   - **Elevation (m)** — site height above sea level (used for air-density estimation)
4. Click **Create**.

Your project now appears on the dashboard and on the interactive **Map** page.

---

## 2. Importing Data

GoKaatru supports multiple file formats:

| Format | Extensions | Notes |
|--------|-----------|-------|
| **CSV** | `.csv` | Auto-detects comma, semicolon, and tab delimiters |
| **NRG Systems** | `.txt` | Reads NRG SymphoniePRO logger files with header metadata |
| **Campbell Scientific** | `.dat` | Reads TOA5 format with 4-line header (metadata, units, processing) |
| **Excel** | `.xlsx` | Multi-sheet support; select which sheet to import |
| **Tab-delimited** | `.txt` | Auto-detected by delimiter sniffer |

### Import Steps

1. Open your project and go to the **Import** page.
2. Drag-and-drop a file (or click to browse).
3. GoKaatru shows a **preview** with auto-detected columns:
   - **Column name** — original header
   - **Type** — speed, direction, temperature, pressure, etc. (auto-detected from name patterns)
   - **Unit** — m/s, °, °C, hPa, etc.
   - **Height** — extracted from names like `Speed_80m`
4. Review and adjust column mappings if needed.
5. Give the dataset a name and click **Confirm Import**.

The dataset is now stored in the database and available for analysis.

### Column Auto-Detection Patterns

| Pattern in Column Name | Detected Type |
|----------------------|---------------|
| `speed`, `ws`, `vel`, `windspd` | Wind Speed |
| `dir`, `wd`, `winddir` | Wind Direction |
| `sd`, `std`, `stdev`, `sigma` | Standard Deviation |
| `temp`, `t_` | Temperature |
| `press`, `bp`, `baro` | Pressure |
| `rh`, `humid` | Relative Humidity |
| `gust`, `max` | Gust Speed |
| `solar`, `ghi`, `radiation` | Solar Radiation |
| Number + `m` (e.g. `80m`) | Height extracted |

---

## 3. Viewing Time Series

After importing, navigate to the **Time Series** page to view your data:

- Select which columns to display
- Zoom in/out on the time axis
- Flag exclusions are visualized as shaded regions
- Resampling options (10-min, hourly, daily) for large datasets

---

## 4. Quality Control

The **QC** page provides tools to identify and flag bad data.

### Creating Flags

1. Click **Add Flag**.
2. Give it a name (e.g. "Icing") and choose a color.
3. Flags are categories — you can have multiple flags per dataset.

### Automatic Rules

Rules automatically detect bad data:

1. Select a flag, then click **Add Rule**.
2. Configure the rule:
   - **Column** — which measurement to check
   - **Operator** — `gt`, `lt`, `eq`, `between`
   - **Value** — threshold(s)
3. Combine rules with **AND/OR** logic and grouping.
4. Click **Apply Rules** — the engine scans the full timeseries and creates flagged time ranges.

**Example rules:**
- Speed > 50 m/s (remove sensor errors)
- Speed < 0.3 m/s AND Temperature < -5 °C (possible icing)

### Manual Flagging

For isolated issues:

1. Select a flag and choose **Manual Flag**.
2. Set start and end times, and which columns are affected.

### Tower Shadow Detection

Tower-mounted anemometers can be shadowed by the tower structure:

1. Go to **Tower Shadow** on the QC page.
2. Choose the detection method (manual sector or automatic).
3. Preview affected data before applying.

### Data Reconstruction

Fill gaps in your data:

1. Go to **Reconstruct** on the QC page.
2. Choose a column with missing data.
3. Select a method:
   - **Linear interpolation** — for short gaps
   - **KNN imputation** — uses similar timestamps
   - **Correlation-based** — uses a reference column or dataset
4. Preview the result, then save (overwrite or create new column).

All QC operations are recorded in the **history log** and can be **undone**.

---

## 5. Wind Analysis

The **Analysis** page offers a suite of tools. All support flag exclusion to mask bad data.

### Wind Rose

Visualizes wind speed and direction distribution by sector.

- Select speed and direction columns
- Choose number of sectors (12, 16, 36)
- Customize speed bin edges

### Frequency Histogram

Shows the distribution of any variable.

- Select column, bin width, and range
- Useful for identifying measurement anomalies

### Weibull Fit

Fits a Weibull distribution to wind speed data.

- Methods: **MLE** (Maximum Likelihood) or **Moments**
- Returns shape (k) and scale (A) parameters
- Overlays the fitted PDF on the observed histogram

### Wind Shear

Analyzes how wind speed changes with height.

- Requires speeds at ≥ 2 heights
- Methods: **Power Law** (returns α exponent) or **Log Law** (returns roughness length z₀)
- Results can be used to **extrapolate** speed to hub height (creates a new column)

### Turbulence Intensity

Evaluates turbulence characteristics:

- Requires speed and standard deviation columns
- Bins by wind speed and direction sector
- Reports **IEC turbulence class** (A, B, or C)

### Air Density

Calculates air density and wind power density:

- Uses temperature and pressure (measured or estimated from elevation)
- Reports monthly summaries

### Extreme Wind

Fits Gumbel distribution to annual maximum wind speeds:

- Returns return-period wind speeds (1, 5, 10, 25, 50, 100 years)
- Optionally includes gust factor analysis

### Profiles

Creates diurnal and monthly variation profiles:

- Heatmap showing variation by hour and month
- Annual overlays for multi-year datasets

---

## 6. MCP (Long-Term Correction)

The **MCP** page adjusts short-term site measurements using long-term reference data.

### Overview

MCP (Measure-Correlate-Predict) uses the overlap period between site measurements and reanalysis data (e.g. ERA5) to establish a relationship, then predicts what the site conditions would have been over the full reference period.

### Steps

1. **Import reference data** — upload a reanalysis CSV or use the built-in ERA5/MERRA2 download.
2. **Correlate** — select site speed column and reference speed column. The engine calculates R², slope, bias, and scatter data.
3. **Predict** — choose a method:
   - **Linear** — standard linear regression
   - **Variance Ratio** — preserves mean and standard deviation
   - **Matrix** — direction/speed-bin matrix method
4. **Compare** — run all methods and compare cross-validation metrics. The engine recommends the best-performing method.

---

## 7. Energy Estimation

The **Energy** page calculates gross energy production.

### Steps

1. **Upload or select a power curve** from the library.
2. Select a wind speed column (use an extrapolated hub-height column for best results).
3. Optionally enable **air density adjustment** (requires temperature and pressure columns).
4. The engine returns:
   - **Annual Energy Production (AEP)** in MWh
   - **Capacity Factor** (%)
   - **Equivalent Full Load Hours**
   - Monthly and speed-bin breakdowns

### Power Curve Library

GoKaatru maintains a power curve library:

- A default sample curve is seeded automatically
- Upload custom curves from CSV files (columns: `wind_speed`, `power_kw`)
- Curves are reusable across projects

---

## 8. Exporting Data

The **Export** page supports multiple industry-standard formats:

| Format | Description | Use Case |
|--------|-------------|----------|
| **CSV** | Comma-separated values | General data exchange |
| **WAsP TAB** | Wind Atlas Analysis format | WAsP flow modeling |
| **IEA JSON** | IEA Task 43 exchange format | Standardized WRA data exchange |
| **OpenWind** | OpenWind CSV layout | OpenWind energy modeling |
| **KML** | Google Earth format | Site visualization on maps |

All exports support:
- Column selection
- Flag exclusion (removes flagged periods)
- Time resampling

---

## 9. Report Generation

Generate professional reports in PDF or DOCX format.

1. Navigate to the **Reports** page.
2. Select a dataset and choose sections to include:
   - Data Summary
   - Wind Rose
   - Frequency Distribution
   - Wind Shear
   - Turbulence
   - Air Density
   - Extreme Wind
   - Energy Estimate
   - MCP Summary
3. Choose format (PDF or DOCX) and generate.
4. The report is downloaded automatically.

---

## 10. Workflows (Automation)

Workflows let you save and replay multi-step processing pipelines.

### Creating a Workflow

1. Go to the **Workflows** page.
2. Click **New Workflow** and give it a name.
3. Add steps in order:
   - **Import File** — import a specific data file
   - **Apply QC Rules** — create and apply quality flags
   - **Reconstruct Gaps** — fill missing data
   - **Calculate Shear** — run shear and extrapolation
   - **Run MCP** — long-term correction
   - **Generate Report** — create PDF/DOCX
   - **Export Data** — save to CSV/WAsP/etc.
4. Save the workflow.

### Running a Workflow

Click **Run** to execute all steps in sequence. Each step's result is shown upon completion. If a step fails, the workflow halts and reports the error.

Workflows are useful for:
- Standardizing processing across multiple sites
- Re-running analysis after data updates
- Documenting your processing methodology

---

## Tips

- **Flag exclusions** apply across all analysis tools — flag bad data once, and every calculation respects it.
- **Undo** is available for all QC operations — check the history log.
- Use **multi-height data** (e.g. 40 m, 60 m, 80 m) for shear analysis and hub-height extrapolation.
- **Multi-year data** (≥ 3 years) improves extreme wind analysis reliability.
- The **MCP compare** feature helps choose the best long-term correction method objectively.
