from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from tempfile import gettempdir
from typing import Any, Awaitable, Callable, Literal

import httpx
import numpy as np
import pandas as pd
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import DataColumn, Dataset, TimeseriesData


ReanalysisSource = Literal["era5", "merra2"]
ProgressCallback = Callable[[int, str], Awaitable[None]]
AsyncSessionFactory = async_sessionmaker[AsyncSession]
ERA5_COLLECTION_URL = "https://earthdatahub.destine.eu/collections/era5/datasets/reanalysis-era5-single-levels"
NASA_POWER_HOURLY_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
CACHE_DIR = Path(gettempdir()) / "windwhisper_reanalysis_cache"
FILL_VALUES = {-999, -999.0, -999.00, -9999, -9999.0}
DOWNLOAD_TASKS: dict[uuid.UUID, dict[str, Any]] = {}
DOWNLOAD_TASKS_LOCK = asyncio.Lock()


@dataclass(slots=True)
class ReferenceDownloadJob:
    project_id: uuid.UUID
    source: ReanalysisSource
    latitude: float
    longitude: float
    start_year: int
    end_year: int
    dataset_name: str | None = None
    api_key: str | None = None


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _ensure_cache_dir() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR


def _cache_path(job: ReferenceDownloadJob) -> Path:
    cache_key = hashlib.sha1(
        f"{job.source}:{job.latitude:.4f}:{job.longitude:.4f}:{job.start_year}:{job.end_year}".encode("utf-8"),
    ).hexdigest()
    return _ensure_cache_dir() / f"{cache_key}.json"


def _task_payload(task_id: uuid.UUID, job: ReferenceDownloadJob) -> dict[str, Any]:
    return {
        "task_id": task_id,
        "project_id": job.project_id,
        "source": job.source,
        "status": "queued",
        "message": "Queued",
        "progress": 0,
        "dataset_id": None,
        "dataset_name": None,
        "row_count": 0,
        "column_count": 0,
        "error": None,
        "started_at": _utcnow(),
        "completed_at": None,
    }


async def _update_task(task_id: uuid.UUID, **changes: Any) -> None:
    async with DOWNLOAD_TASKS_LOCK:
        current = DOWNLOAD_TASKS.get(task_id)
        if current is None:
            return
        current.update(changes)


async def create_download_task(job: ReferenceDownloadJob, session_factory: AsyncSessionFactory) -> uuid.UUID:
    task_id = uuid.uuid4()
    async with DOWNLOAD_TASKS_LOCK:
        DOWNLOAD_TASKS[task_id] = _task_payload(task_id, job)
    asyncio.create_task(_run_download_task(task_id, job, session_factory), name=f"reference-download-{task_id}")
    return task_id


async def get_download_task(task_id: uuid.UUID) -> dict[str, Any] | None:
    async with DOWNLOAD_TASKS_LOCK:
        task = DOWNLOAD_TASKS.get(task_id)
        return dict(task) if task is not None else None


def _normalize_pressure_hpa(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    median_value = float(values.dropna().median()) if values.notna().any() else np.nan
    if np.isnan(median_value):
        return values
    if median_value > 2000:
        return values / 100.0
    if 50 <= median_value <= 150:
        return values * 10.0
    return values


def _wind_direction_from_components(u_component: pd.Series, v_component: pd.Series) -> pd.Series:
    return (270.0 - np.degrees(np.arctan2(v_component, u_component))) % 360.0


def _clean_numeric_frame(frame: pd.DataFrame) -> pd.DataFrame:
    cleaned = frame.copy()
    for column in cleaned.columns:
        cleaned[column] = pd.to_numeric(cleaned[column], errors="coerce")
        cleaned[column] = cleaned[column].replace(list(FILL_VALUES), np.nan)
    cleaned = cleaned.sort_index()
    cleaned.index = pd.to_datetime(cleaned.index, utc=True, errors="coerce")
    cleaned = cleaned[cleaned.index.notna()]
    cleaned.index.name = "timestamp"
    return cleaned


def _load_cached_frame(cache_path: Path) -> tuple[pd.DataFrame, dict[str, Any]] | None:
    if not cache_path.exists():
        return None
    payload = json.loads(cache_path.read_text(encoding="utf-8"))
    frame = pd.read_json(StringIO(payload["frame"]), orient="table")
    if "timestamp" not in frame.columns:
        raise ValueError("Cached reference data is missing timestamps")
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True, errors="coerce")
    frame = frame.set_index("timestamp").sort_index()
    return _clean_numeric_frame(frame), payload.get("metadata", {})


def _write_cache(cache_path: Path, frame: pd.DataFrame, metadata: dict[str, Any]) -> None:
    serializable = frame.reset_index(names="timestamp")
    payload = {
        "metadata": metadata,
        "frame": serializable.to_json(orient="table", date_format="iso"),
    }
    cache_path.write_text(json.dumps(payload), encoding="utf-8")


def _standard_dataset_name(job: ReferenceDownloadJob) -> str:
    source_label = "ERA5" if job.source == "era5" else "MERRA-2 POWER"
    return f"{source_label} {job.start_year}-{job.end_year} ({job.latitude:.3f}, {job.longitude:.3f})"


def _column_specs(frame: pd.DataFrame, source: ReanalysisSource) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for column in frame.columns:
        measurement_type = "other"
        height_m: float | None = None
        unit: str | None = None
        if column.startswith("Speed_"):
            measurement_type = "speed"
            height_m = float(column.split("_")[1].replace("m", ""))
            unit = "m/s"
        elif column.startswith("Dir_"):
            measurement_type = "direction"
            height_m = float(column.split("_")[1].replace("m", ""))
            unit = "deg"
        elif column == "Temp_2m":
            measurement_type = "temperature"
            height_m = 2.0
            unit = "C"
        elif column == "Pressure_hPa":
            measurement_type = "pressure"
            unit = "hPa"
        specs.append(
            {
                "name": column,
                "measurement_type": measurement_type,
                "height_m": height_m,
                "unit": unit,
                "sensor_info": {"source": source},
            },
        )
    return specs


def _build_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            "timestamp": timestamp.to_pydatetime(),
            "values_json": {
                column: (None if pd.isna(value) else float(value))
                for column, value in row.items()
            },
        }
        for timestamp, row in frame.iterrows()
    ]


async def _persist_reference_dataset(
    session: AsyncSession,
    job: ReferenceDownloadJob,
    frame: pd.DataFrame,
    metadata: dict[str, Any],
) -> tuple[Dataset, int, int]:
    if frame.empty:
        raise ValueError("Downloaded reference data did not contain any rows")

    dataset = Dataset(
        project_id=job.project_id,
        name=job.dataset_name or _standard_dataset_name(job),
        source_type="reanalysis",
        file_name=f"{job.source}_{job.start_year}_{job.end_year}.json",
        time_step_seconds=int((frame.index[1] - frame.index[0]).total_seconds()) if len(frame.index) > 1 else None,
        start_time=frame.index.min().to_pydatetime(),
        end_time=frame.index.max().to_pydatetime(),
        metadata_json={
            "provider": "earthdatahub" if job.source == "era5" else "nasa_power",
            "source": job.source,
            "latitude": job.latitude,
            "longitude": job.longitude,
            "start_year": job.start_year,
            "end_year": job.end_year,
            **metadata,
        },
    )
    session.add(dataset)
    await session.flush()

    column_specs = _column_specs(frame, job.source)
    session.add_all(
        [
            DataColumn(
                dataset_id=dataset.id,
                name=spec["name"],
                unit=spec["unit"],
                measurement_type=spec["measurement_type"],
                height_m=spec["height_m"],
                sensor_info=spec["sensor_info"],
            )
            for spec in column_specs
        ],
    )
    await session.flush()

    rows = _build_records(frame)
    if rows:
        await session.execute(
            insert(TimeseriesData),
            [{"dataset_id": dataset.id, **row} for row in rows],
        )
    await session.commit()
    return dataset, len(frame), len(column_specs)


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        raise ValueError("Unexpected ERA5 response payload")

    for key in ("data", "records", "items", "hours"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    features = payload.get("features")
    if isinstance(features, list):
        records: list[dict[str, Any]] = []
        for feature in features:
            if not isinstance(feature, dict):
                continue
            properties = feature.get("properties")
            if isinstance(properties, dict):
                records.append(properties)
        if records:
            return records

    properties = payload.get("properties")
    if isinstance(properties, dict):
        for key in ("data", "records", "hours"):
            value = properties.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

    raise ValueError("ERA5 response did not contain recognizable records")


def _extract_timestamp_column(frame: pd.DataFrame) -> str:
    for candidate in ("timestamp", "datetime", "valid_time", "time", "date", "DateTime"):
        if candidate in frame.columns:
            return candidate
    raise ValueError("Reference response does not contain a timestamp field")


def _match_column(columns: list[str], *aliases: str) -> str | None:
    lowered = {column.lower(): column for column in columns}
    for alias in aliases:
        if alias.lower() in lowered:
            return lowered[alias.lower()]
    return None


def _standardize_era5_frame(payload: Any) -> pd.DataFrame:
    raw_frame = pd.DataFrame.from_records(_extract_records(payload))
    if raw_frame.empty:
        raise ValueError("ERA5 response did not contain any rows")

    timestamp_column = _extract_timestamp_column(raw_frame)
    timestamps = pd.to_datetime(raw_frame[timestamp_column], utc=True, errors="coerce")
    frame = raw_frame.drop(columns=[timestamp_column]).copy()
    frame.index = timestamps
    frame.index.name = "timestamp"
    frame = _clean_numeric_frame(frame)

    u100 = _match_column(list(frame.columns), "100m_u_component_of_wind", "u100", "u100m")
    v100 = _match_column(list(frame.columns), "100m_v_component_of_wind", "v100", "v100m")
    u10 = _match_column(list(frame.columns), "10m_u_component_of_wind", "u10", "u10m")
    v10 = _match_column(list(frame.columns), "10m_v_component_of_wind", "v10", "v10m")
    temp = _match_column(list(frame.columns), "2m_temperature", "t2m", "temperature_2m")
    pressure = _match_column(list(frame.columns), "surface_pressure", "sp", "pressure")

    standardized = pd.DataFrame(index=frame.index)
    if u100 and v100:
        standardized["Speed_100m"] = np.sqrt(frame[u100] ** 2 + frame[v100] ** 2)
        standardized["Dir_100m"] = _wind_direction_from_components(frame[u100], frame[v100])
    if u10 and v10:
        standardized["Speed_10m"] = np.sqrt(frame[u10] ** 2 + frame[v10] ** 2)
        standardized["Dir_10m"] = _wind_direction_from_components(frame[u10], frame[v10])
    if temp:
        standardized["Temp_2m"] = frame[temp]
    if pressure:
        standardized["Pressure_hPa"] = _normalize_pressure_hpa(frame[pressure])

    if standardized.empty:
        raise ValueError("ERA5 response did not include the expected wind, temperature, or pressure fields")
    return standardized.dropna(how="all")


def _standardize_merra2_frame(payload: dict[str, Any]) -> pd.DataFrame:
    parameters = payload.get("properties", {}).get("parameter", {})
    if not isinstance(parameters, dict) or not parameters:
        raise ValueError("MERRA-2 response did not include parameter data")

    keys = sorted({timestamp for series in parameters.values() if isinstance(series, dict) for timestamp in series.keys()})
    if not keys:
        raise ValueError("MERRA-2 response did not include hourly samples")

    frame = pd.DataFrame(index=pd.to_datetime(keys, format="%Y%m%d%H", utc=True))
    frame.index.name = "timestamp"
    for source_name, target_name in {
        "WS50M": "Speed_50m",
        "WD50M": "Dir_50m",
        "T2M": "Temp_2m",
        "PS": "Pressure_hPa",
    }.items():
        values = parameters.get(source_name)
        if isinstance(values, dict):
            frame[target_name] = pd.Series(values).reindex(keys).to_numpy()

    frame = _clean_numeric_frame(frame)
    if "Pressure_hPa" in frame.columns:
        frame["Pressure_hPa"] = _normalize_pressure_hpa(frame["Pressure_hPa"])
    return frame.dropna(how="all")


async def download_era5(
    lat: float,
    lon: float,
    start_year: int,
    end_year: int,
    api_key: str,
    progress_callback: ProgressCallback | None = None,
    variables: list[str] | None = None,
) -> pd.DataFrame:
    if not api_key.strip():
        raise ValueError("ERA5 downloads require an EarthDataHub API key")
    if progress_callback is not None:
        await progress_callback(20, "Requesting ERA5 data from EarthDataHub")

    requested_variables = variables or [
        "100m_u_component_of_wind",
        "100m_v_component_of_wind",
        "10m_u_component_of_wind",
        "10m_v_component_of_wind",
        "2m_temperature",
        "surface_pressure",
    ]
    headers = {"Authorization": f"Bearer {api_key.strip()}", "x-api-key": api_key.strip()}
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_year": start_year,
        "end_year": end_year,
        "variables": ",".join(requested_variables),
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(ERA5_COLLECTION_URL, params=params, headers=headers)
        response.raise_for_status()
        payload = response.json()

    if progress_callback is not None:
        await progress_callback(55, "Transforming ERA5 response")
    return _standardize_era5_frame(payload)


async def download_merra2(
    lat: float,
    lon: float,
    start_year: int,
    end_year: int,
    progress_callback: ProgressCallback | None = None,
) -> pd.DataFrame:
    if progress_callback is not None:
        await progress_callback(20, "Requesting hourly POWER reanalysis data")

    params = {
        "latitude": lat,
        "longitude": lon,
        "start": f"{start_year}0101",
        "end": f"{end_year}1231",
        "community": "RE",
        "parameters": "WS50M,WD50M,T2M,PS",
        "time-standard": "UTC",
        "format": "JSON",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(NASA_POWER_HOURLY_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    if progress_callback is not None:
        await progress_callback(55, "Transforming POWER hourly response")
    return _standardize_merra2_frame(payload)


async def _load_or_download(job: ReferenceDownloadJob, progress_callback: ProgressCallback) -> tuple[pd.DataFrame, dict[str, Any]]:
    cache_path = _cache_path(job)
    cached = _load_cached_frame(cache_path)
    if cached is not None:
        await progress_callback(50, "Loaded cached reference data")
        frame, metadata = cached
        return frame, {**metadata, "cache_hit": True}

    if job.source == "era5":
        frame = await download_era5(job.latitude, job.longitude, job.start_year, job.end_year, job.api_key or "", progress_callback)
        metadata = {"provider_url": ERA5_COLLECTION_URL, "variables": list(frame.columns), "cache_hit": False}
    else:
        frame = await download_merra2(job.latitude, job.longitude, job.start_year, job.end_year, progress_callback)
        metadata = {"provider_url": NASA_POWER_HOURLY_URL, "variables": list(frame.columns), "cache_hit": False}

    _write_cache(cache_path, frame, metadata)
    return frame, metadata


async def _run_download_task(task_id: uuid.UUID, job: ReferenceDownloadJob, session_factory: AsyncSessionFactory) -> None:
    async def progress_callback(progress: int, message: str) -> None:
        await _update_task(task_id, status="running", progress=progress, message=message)

    try:
        await progress_callback(5, "Preparing reference download")
        frame, metadata = await _load_or_download(job, progress_callback)
        await progress_callback(75, "Importing reference dataset")

        async with session_factory() as session:
            dataset, row_count, column_count = await _persist_reference_dataset(session, job, frame, metadata)

        await _update_task(
            task_id,
            status="completed",
            progress=100,
            message="Reference dataset imported",
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            row_count=row_count,
            column_count=column_count,
            completed_at=_utcnow(),
        )
    except Exception as exc:
        await _update_task(
            task_id,
            status="failed",
            progress=100,
            message="Reference download failed",
            error=str(exc),
            completed_at=_utcnow(),
        )
