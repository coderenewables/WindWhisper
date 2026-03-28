from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field


ReportFormat = Literal["docx", "pdf"]
ReportSectionId = Literal[
    "title_page",
    "executive_summary",
    "site_description",
    "data_summary",
    "qc_summary",
    "wind_rose",
    "frequency_distribution",
    "wind_shear",
    "turbulence",
    "air_density",
    "extreme_wind",
    "long_term_adjustment",
    "energy_estimate",
]


class ReportGenerateRequest(BaseModel):
    dataset_id: uuid.UUID
    sections: list[ReportSectionId] = Field(default_factory=list)
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    format: ReportFormat = "pdf"
    title: str | None = None
    column_selection: "ReportColumnSelection" = Field(default_factory=lambda: ReportColumnSelection())
    power_curve_id: uuid.UUID | None = None


class ReportColumnSelection(BaseModel):
    speed_column_id: uuid.UUID | None = None
    direction_column_id: uuid.UUID | None = None
    temperature_column_id: uuid.UUID | None = None
    pressure_column_id: uuid.UUID | None = None
    turbulence_column_id: uuid.UUID | None = None
    gust_column_id: uuid.UUID | None = None
    shear_column_ids: list[uuid.UUID] = Field(default_factory=list)
