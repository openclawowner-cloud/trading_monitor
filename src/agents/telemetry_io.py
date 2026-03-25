"""Atomic JSON file writes for agent telemetry (prevents truncated files on crash/kill)."""
from __future__ import annotations

import json
import os
import time
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
        attempts = 6
        for i in range(attempts):
            try:
                os.replace(tmp_path, path)
                return
            except PermissionError:
                # Windows can briefly lock telemetry files while readers are active.
                if i >= attempts - 1:
                    raise
                time.sleep(0.03 * (i + 1))
            except OSError as exc:
                # Retry only on common "file in use/access denied" replace errors.
                if getattr(exc, "winerror", None) not in (5, 32) or i >= attempts - 1:
                    raise
                time.sleep(0.03 * (i + 1))
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
