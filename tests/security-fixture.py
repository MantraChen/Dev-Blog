"""Seed the HTTP smoke server with a synthetic advisory using the publisher."""

import importlib.util
from pathlib import Path
import sqlite3
import sys

script = Path(__file__).resolve().parents[1] / "scripts/security-sync.py"
spec = importlib.util.spec_from_file_location("security_sync", script)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

with sqlite3.connect(sys.argv[1]) as db:
    db.executescript(sync.SCHEMA)
    sync.put(db, "GitHub", {
        "id": "GHSA-2345-2345-2345",
        "summary": "Synthetic advisory",
        "published": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z",
    })
    sync.materialize(db)
