"""API interna del servicio de ML. Solo la consume el backend NestJS (red interna).

Cada ruta de negocio exige el encabezado ``X-Internal-Token`` y recibe la empresa en la ruta:
el backend la toma del contexto autenticado, nunca del cliente final. El servicio no se conecta
a la base de datos: entrena con los datos agregados que le envia el backend o con datos
sinteticos generados con la forma del catalogo de la empresa.
"""

from __future__ import annotations

import hmac
import os
from typing import Annotated

import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import __version__, store
from .demand import InsufficientDataError
from .schemas import ForecastRequest, TrainRequest
from .training import train_tenant

app = FastAPI(title="FashionStore ML", version=__version__)
TenantId = Annotated[int, Path(ge=1, le=2_147_483_647)]


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(status_code=status, detail={"code": code, "message": message})


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detail)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    # Sin eco de los datos recibidos: solo ubicacion y motivo.
    errors = [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()[:20]]
    return JSONResponse(status_code=422, content={"code": "VALIDATION_ERROR", "message": "Datos invalidos", "errors": errors})


def require_token(x_internal_token: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("ML_SERVICE_TOKEN", "")
    if not expected:
        raise ApiError(503, "ML_TOKEN_NOT_CONFIGURED", "ML_SERVICE_TOKEN no esta configurado")
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise ApiError(401, "INVALID_INTERNAL_TOKEN", "Token interno invalido")


def bundle_or_404(tenant_id: int) -> dict:
    bundle = store.load(tenant_id)
    if bundle is None:
        raise ApiError(404, "MODEL_NOT_TRAINED", "La empresa aun no tiene modelos entrenados")
    return bundle


def part(bundle: dict, name: str):
    if name not in bundle:
        message = bundle.get("parts", {}).get(name, {}).get("message", "Modelo no entrenado")
        raise ApiError(409, "PART_NOT_TRAINED", message)
    return bundle[name]


def iso(value) -> str:
    return pd.Timestamp(value).date().isoformat()


@app.get("/health")
def health():
    return {"status": "ok", "version": __version__}


secured = [Depends(require_token)]


@app.post("/v1/tenants/{tenant_id}/train", dependencies=secured)
def train(tenant_id: TenantId, req: TrainRequest):
    try:
        return train_tenant(tenant_id, req)
    except InsufficientDataError as error:
        raise ApiError(422, "INSUFFICIENT_DATA", str(error)) from error


@app.get("/v1/tenants/{tenant_id}/metrics", dependencies=secured)
def metrics(tenant_id: TenantId):
    bundle = bundle_or_404(tenant_id)
    return {**bundle["meta"], "parts": bundle["parts"]}


@app.post("/v1/tenants/{tenant_id}/forecast", dependencies=secured)
def forecast(tenant_id: TenantId, req: ForecastRequest):
    model = part(bundle_or_404(tenant_id), "demand")
    series, totals = model.forecast(req.horizon, req.productIds, req.branchIds)
    ranking = (
        series.groupby(["productId", "branchId"], as_index=False)["units"].sum().sort_values("units", ascending=False).head(req.top)
    )
    top = []
    for row in ranking.itertuples():
        weeks = series[(series["productId"] == row.productId) & (series["branchId"] == row.branchId)]
        top.append(
            {
                "productId": int(row.productId),
                "branchId": int(row.branchId),
                "units": round(float(row.units), 1),
                "weeks": [
                    {"week": iso(w.week), "units": round(float(w.units), 2), "low": round(float(w.low), 2), "high": round(float(w.high), 2)}
                    for w in weeks.itertuples()
                ],
            }
        )
    return {
        "horizon": req.horizon,
        "lastObservedWeek": iso(model.history["week"].max()),
        "series": int(series.groupby(["productId", "branchId"]).ngroups) if not series.empty else 0,
        "totals": [
            {"week": iso(t.week), "units": round(t.units, 1), "low": round(t.low, 1), "high": round(t.high, 1)} for t in totals.itertuples()
        ],
        "top": top,
        "interval": "percentiles 10-90 de los arboles del bosque",
    }


@app.get("/v1/tenants/{tenant_id}/segments", dependencies=secured)
def segments(tenant_id: TenantId, assignments: bool = Query(default=False)):
    result = part(bundle_or_404(tenant_id), "segmentation")
    body = {"summary": result.summary, "metrics": result.metrics}
    if assignments:
        body["assignments"] = result.assignments.head(5_000).round(2).to_dict(orient="records")
    return body


@app.get("/v1/tenants/{tenant_id}/anomalies", dependencies=secured)
def anomaly_weeks(tenant_id: TenantId, weeks: int = Query(default=52, ge=4, le=156)):
    result = part(bundle_or_404(tenant_id), "anomalies")
    recent = result.weeks[result.weeks["week"] >= result.weeks["week"].max() - pd.Timedelta(weeks=weeks - 1)]
    return {
        "metrics": result.metrics,
        "flagged": [
            {
                "branchId": int(r.branchId),
                "week": iso(r.week),
                "units": round(float(r.units), 1),
                "expected": round(float(r.expected), 1),
                "kind": r.kind,
                "score": round(float(r.score), 4),
            }
            for r in result.flagged().itertuples()
        ],
        "series": [
            {"branchId": int(r.branchId), "week": iso(r.week), "units": round(float(r.units), 1), "expected": round(float(r.expected), 1), "anomaly": bool(r.anomaly)}
            for r in recent.itertuples()
        ],
    }
