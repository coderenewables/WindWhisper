from __future__ import annotations

from app.schemas.report import ReportSectionId


REPORT_SECTION_LABELS: dict[ReportSectionId, str] = {
    "title_page": "Title Page",
    "executive_summary": "Executive Summary",
    "site_description": "Site Description",
    "data_summary": "Data Summary",
    "qc_summary": "QC Summary",
    "wind_rose": "Wind Rose",
    "frequency_distribution": "Frequency Distribution",
    "wind_shear": "Wind Shear",
    "turbulence": "Turbulence",
    "air_density": "Air Density",
    "extreme_wind": "Extreme Wind",
    "long_term_adjustment": "Long-Term Adjustment",
    "energy_estimate": "Energy Estimate",
}

DEFAULT_REPORT_SECTIONS: list[ReportSectionId] = [
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
    "energy_estimate",
]
