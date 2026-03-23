"""Atomic JSON file writes for agent telemetry (prevents truncated files on crash/kill)."""
from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Callable, Optional


def atomic_write_json(
    path: str,
    obj: Any,
    *,
    indent: int = 2,
    default: Optional[Callable[[Any], Any]] = None,
) -> None:
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".telemetry.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=indent, default=default)
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
