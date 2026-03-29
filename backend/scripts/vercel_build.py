from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def main() -> int:
    if os.getenv("VERCEL_RUN_DB_MIGRATIONS", "false").strip().lower() not in {"1", "true", "yes", "on"}:
        print("Skipping database migrations during Vercel build.")
        return 0

    print("Running alembic upgrade head for Vercel deployment.")
    completed = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=False,
    )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())