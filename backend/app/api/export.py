from __future__ import annotations

import uuid
from io import BytesIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.export import CSVExportRequest, IEAJSONExportRequest, OpenwindExportRequest, WAsPTabExportRequest
from app.services.export_engine import export_csv, export_iea_json, export_openwind, export_wasp_tab


router = APIRouter(prefix="/api/export", tags=["export"])


def _stream_artifact(content: bytes, file_name: str, media_type: str) -> StreamingResponse:
    response = StreamingResponse(BytesIO(content), media_type=media_type)
    response.headers["Content-Disposition"] = f'attachment; filename="{file_name}"'
    return response


@router.post("/csv/{dataset_id}")
async def download_csv_export(
    dataset_id: uuid.UUID,
    payload: CSVExportRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    artifact = await export_csv(
        db,
        dataset_id,
        column_ids=payload.column_ids,
        exclude_flag_ids=payload.exclude_flags,
        resample=payload.resample,
    )
    return _stream_artifact(artifact.content, artifact.file_name, artifact.media_type)


@router.post("/wasp-tab/{dataset_id}")
async def download_wasp_tab_export(
    dataset_id: uuid.UUID,
    payload: WAsPTabExportRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    artifact = await export_wasp_tab(
        db,
        dataset_id,
        speed_column_id=payload.speed_column_id,
        direction_column_id=payload.direction_column_id,
        exclude_flag_ids=payload.exclude_flags,
        num_sectors=payload.num_sectors,
        speed_bin_width=payload.speed_bin_width,
    )
    return _stream_artifact(artifact.content, artifact.file_name, artifact.media_type)


@router.post("/iea-json/{dataset_id}")
async def download_iea_json_export(
    dataset_id: uuid.UUID,
    payload: IEAJSONExportRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    artifact = await export_iea_json(
        db,
        dataset_id,
        column_ids=payload.column_ids,
        exclude_flag_ids=payload.exclude_flags,
        resample=payload.resample,
    )
    return _stream_artifact(artifact.content, artifact.file_name, artifact.media_type)


@router.post("/openwind/{dataset_id}")
async def download_openwind_export(
    dataset_id: uuid.UUID,
    payload: OpenwindExportRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    artifact = await export_openwind(
        db,
        dataset_id,
        column_ids=payload.column_ids,
        exclude_flag_ids=payload.exclude_flags,
        resample=payload.resample,
    )
    return _stream_artifact(artifact.content, artifact.file_name, artifact.media_type)