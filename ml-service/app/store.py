"""Persistencia de modelos por empresa (un archivo joblib por tenant).

Cada empresa tiene su propio directorio ``tenant-<id>``; un modelo nunca se comparte entre
empresas. La escritura es atomica (archivo temporal + ``os.replace``) para que una lectura
concurrente nunca vea un archivo a medias.
"""

from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path

import joblib

_lock = threading.Lock()
_cache: dict[int, tuple[float, dict]] = {}


def models_dir() -> Path:
    return Path(os.environ.get("ML_MODELS_DIR", "models"))


def _path(tenant_id: int) -> Path:
    return models_dir() / f"tenant-{int(tenant_id)}" / "bundle.joblib"


def save(tenant_id: int, bundle: dict) -> None:
    path = _path(tenant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        os.close(fd)
        try:
            joblib.dump(bundle, tmp, compress=3)
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        _cache.pop(tenant_id, None)


def load(tenant_id: int) -> dict | None:
    path = _path(tenant_id)
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    cached = _cache.get(tenant_id)
    if cached and cached[0] == mtime:
        return cached[1]
    bundle = joblib.load(path)
    _cache[tenant_id] = (mtime, bundle)
    return bundle
