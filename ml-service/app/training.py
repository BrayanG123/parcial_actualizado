"""Orquesta el entrenamiento de los tres modelos para una empresa."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd

from . import __version__, anomalies, demand, segmentation, store
from .schemas import TrainRequest
from .synthetic import Catalog, generate, last_monday


def _monday(values: pd.Series) -> pd.Series:
    d = pd.to_datetime(values)
    return d - pd.to_timedelta(d.dt.day_of_week, unit="D")


def train_tenant(tenant_id: int, req: TrainRequest) -> dict:
    as_of = pd.Timestamp(req.asOf or date.today())
    truth_profiles = truth_anomalies = None
    if req.source == "synthetic":
        catalog = (
            Catalog(
                branches=[b.model_dump() for b in req.catalog.branches],
                products=[p.model_dump() for p in req.catalog.products],
            )
            if req.catalog
            else None
        )
        data = generate(req.seed, req.weeks, req.customers, catalog, end_week=last_monday(as_of.date()) - pd.Timedelta(days=7))
        sales, transactions = data.sales, data.transactions
        truth_profiles, truth_anomalies = data.customer_profiles, data.anomalies
        as_of = data.as_of
    else:
        sales = pd.DataFrame([r.model_dump() for r in req.sales])
        if not sales.empty:
            sales["week"] = _monday(sales["week"])
            sales = sales.groupby(["week", "productId", "branchId"], as_index=False).agg(
                categoryId=("categoryId", "last"), price=("price", "mean"), discount=("discount", "mean"), units=("units", "sum")
            )
        transactions = pd.DataFrame([t.model_dump() for t in req.transactions])

    parts: dict[str, dict] = {}
    bundle: dict = {
        "meta": {
            "tenantId": tenant_id,
            "source": req.source,
            "seed": req.seed if req.source == "synthetic" else None,
            "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "asOf": as_of.date().isoformat(),
            "salesRows": int(len(sales)),
            "transactions": int(len(transactions)),
            "serviceVersion": __version__,
        }
    }
    try:
        if sales.empty:
            raise demand.InsufficientDataError("No se enviaron ventas semanales")
        bundle["demand"] = demand.train(sales, req.seed)
        parts["demand"] = {"status": "TRAINED", "metrics": bundle["demand"].metrics}
    except demand.InsufficientDataError as error:
        parts["demand"] = {"status": "INSUFFICIENT_DATA", "message": str(error)}
    try:
        if transactions.empty:
            raise segmentation.InsufficientCustomersError("No se enviaron compras de clientes")
        bundle["segmentation"] = segmentation.train(transactions, as_of, req.seed, truth_profiles)
        parts["segmentation"] = {"status": "TRAINED", "metrics": bundle["segmentation"].metrics}
    except segmentation.InsufficientCustomersError as error:
        parts["segmentation"] = {"status": "INSUFFICIENT_DATA", "message": str(error)}
    result = anomalies.detect(sales, req.seed, truth_anomalies) if not sales.empty else None
    if result is not None and "note" not in result.metrics:
        bundle["anomalies"] = result
        parts["anomalies"] = {"status": "TRAINED", "metrics": result.metrics}
    else:
        parts["anomalies"] = {
            "status": "INSUFFICIENT_DATA",
            "message": "Se necesitan al menos 20 semanas por sucursal con historia previa",
        }

    if not any(p["status"] == "TRAINED" for p in parts.values()):
        raise demand.InsufficientDataError("Ningun modelo tiene datos suficientes")
    bundle["parts"] = parts
    store.save(tenant_id, bundle)
    return {**bundle["meta"], "parts": parts}
