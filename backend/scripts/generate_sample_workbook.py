from __future__ import annotations

from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data" / "sample_met_tower.csv"
XLSX_PATH = ROOT / "data" / "sample_met_tower.xlsx"


def main() -> None:
    frame = pd.read_csv(CSV_PATH)
    frame["Timestamp"] = pd.to_datetime(frame["Timestamp"], utc=True)
    frame["Timestamp"] = frame["Timestamp"].dt.tz_convert(None)
    frame = frame.head(144).copy()

    met_data = pd.DataFrame(
        {
            "Timestamp UTC": frame["Timestamp"],
            "Speed (m/s) 80m": frame["Speed_80m"],
            "Speed SD (m/s) 80m": frame["Speed_SD_60m"],
            "TI (%) 80m": ((frame["Speed_SD_60m"] / frame["Speed_80m"]) * 100).round(2),
            "Gust Max (m/s) 80m": (frame["Speed_80m"] + 0.8).round(2),
            "BP (hPa) 2m": frame["Pressure_hPa"],
            "RH (%) 2m": (58 + (frame.index % 12) * 1.5).round(1),
            "Solar (W/m2)": (120 + (frame.index % 24) * 18).round(1),
        },
    )

    header_row_1 = [
        "Timestamp",
        "Speed",
        "Speed SD",
        "TI",
        "Gust Max",
        "BP",
        "RH",
        "Solar",
    ]
    header_row_2 = [
        "UTC",
        "(m/s) 80m",
        "(m/s) 80m",
        "(%) 80m",
        "(m/s) 80m",
        "(hPa) 2m",
        "(%) 2m",
        "(W/m2)",
    ]

    summary = pd.DataFrame(
        {
            "Metric": ["Rows", "Start", "End", "Primary Height"],
            "Value": [
                len(met_data),
                met_data.iloc[0, 0].isoformat(),
                met_data.iloc[-1, 0].isoformat(),
                "80m",
            ],
        },
    )

    XLSX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(XLSX_PATH, engine="openpyxl") as writer:
        pd.DataFrame([header_row_1, header_row_2]).to_excel(
            writer,
            sheet_name="MetData",
            header=False,
            index=False,
        )
        met_data.to_excel(writer, sheet_name="MetData", index=False, header=False, startrow=2)
        summary.to_excel(writer, sheet_name="Summary", index=False)


if __name__ == "__main__":
    main()