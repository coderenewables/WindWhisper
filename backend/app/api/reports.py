from __future__ import annotations

import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.report import ReportGenerateRequest
from app.services.report_generator import generate_report


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("/generate/{project_id}")
async def generate_project_report(
    project_id: uuid.UUID,
    payload: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    try:
        artifact = await generate_report(
            db,
            project_id,
            dataset_id=payload.dataset_id,
            sections=payload.sections,
            report_format=payload.format,
            exclude_flag_ids=payload.exclude_flags,
            title=payload.title,
            column_selection=payload.column_selection,
            power_curve_id=payload.power_curve_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    response = StreamingResponse(BytesIO(artifact.content), media_type=artifact.media_type)
    response.headers["Content-Disposition"] = f'attachment; filename="{artifact.file_name}"'
    return response
