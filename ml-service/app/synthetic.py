"""Generador reproducible de datos sinteticos con la forma del dominio de FashionStore.

Produce dos tablas:

* ``sales``: unidades vendidas por semana, producto y sucursal (con precio, descuento y
  categoria), que alimenta el modelo supervisado de demanda.
* ``transactions``: compras por cliente (fecha e importe), que alimenta la segmentacion RFM.

La demanda semanal combina efectos conocidos del negocio: popularidad del producto, tamano
de la sucursal, estacionalidad por categoria (abrigo en invierno, poleras en verano), picos de
diciembre y del Dia de la Madre (fines de mayo en Bolivia), promociones, elasticidad al precio,
tendencia suave y ruido sobredisperso. Se inyectan semanas anomalas (picos y caidas) para poder
medir la deteccion de anomalias. Los clientes pertenecen a perfiles latentes (VIP, leales,
regulares, ocasionales, perdidos) que permiten evaluar la segmentacion.

Las compras de clientes se generan de forma independiente de la demanda por producto: es una
simplificacion consciente, porque cada modelo usa solo una de las dos tablas.

Uso por consola::

    python -m app.synthetic --seed 42 --weeks 104 --out data/
"""

from __future__ import annotations

import argparse
import zlib
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_CATEGORIES = {
    1: "Poleras",
    2: "Pantalones",
    3: "Chaquetas",
    4: "Vestidos",
    5: "Accesorios",
}
# Semana del ano (1-52) de mayor demanda por categoria: invierno boliviano en junio-julio.
SEASON_PEAK = {"Poleras": 2, "Pantalones": 14, "Chaquetas": 27, "Vestidos": 45, "Accesorios": 20}
CUSTOMER_PROFILES = {
    # perfil: (proporcion, compras por semana, ticket medio Bs, fraccion del periodo activo al final)
    "VIP": (0.05, 0.60, 650.0, 1.0),
    "Leales": (0.20, 0.25, 320.0, 1.0),
    "Regulares": (0.35, 0.10, 220.0, 1.0),
    "Ocasionales": (0.25, 0.03, 180.0, 1.0),
    "Perdidos": (0.15, 0.12, 250.0, 0.45),
}


@dataclass
class Catalog:
    branches: list[dict]
    products: list[dict]

    @staticmethod
    def default(seed: int) -> "Catalog":
        rng = np.random.default_rng(seed)
        branches = [{"id": i, "name": f"Sucursal {i}"} for i in (1, 2, 3)]
        products = []
        pid = 1
        for cat_id, cat_name in DEFAULT_CATEGORIES.items():
            for n in range(5):
                products.append(
                    {
                        "id": pid,
                        "name": f"{cat_name[:-1]} {n + 1}",
                        "categoryId": cat_id,
                        "categoryName": cat_name,
                        "price": float(round(rng.uniform(60, 420), 0)),
                    }
                )
                pid += 1
        return Catalog(branches, products)


@dataclass
class SyntheticData:
    sales: pd.DataFrame
    transactions: pd.DataFrame
    # Semanas anomalas inyectadas: (branchId, week) -> "spike" | "drop".
    anomalies: dict[tuple[int, pd.Timestamp], str] = field(default_factory=dict)
    # Perfil latente de cada cliente (para evaluar la segmentacion).
    customer_profiles: dict[int, str] = field(default_factory=dict)
    as_of: pd.Timestamp | None = None


def last_monday(today: date | None = None) -> date:
    today = today or date.today()
    return today - timedelta(days=today.weekday())


def _season(category: str, woy: np.ndarray) -> np.ndarray:
    # crc32 y no hash(): hash() cambia entre procesos y romperia la reproducibilidad.
    peak = SEASON_PEAK.get(category, zlib.crc32(category.encode()) % 52 + 1)
    wave = 1 + 0.35 * np.cos(2 * np.pi * (woy - peak) / 52)
    december = np.where(woy >= 49, 1.45, 1.0)
    mothers_day = np.where((woy >= 20) & (woy <= 22), 1.2, 1.0)
    return wave * december * mothers_day


def generate(
    seed: int = 42,
    weeks: int = 104,
    customers: int = 400,
    catalog: Catalog | None = None,
    end_week: date | None = None,
    anomaly_rate: float = 0.02,
) -> SyntheticData:
    """Genera ``weeks`` semanas que terminan en ``end_week`` (un lunes)."""
    rng = np.random.default_rng(seed)
    catalog = catalog or Catalog.default(seed)
    end = pd.Timestamp(end_week or last_monday())
    week_index = pd.date_range(end=end, periods=weeks, freq="7D")
    woy = week_index.isocalendar().week.to_numpy().clip(1, 52).astype(float)
    trend = np.linspace(0.9, 1.1, weeks)

    prices = np.array([p["price"] for p in catalog.products], dtype=float)
    median_price = float(np.median(prices)) if len(prices) else 1.0
    branch_factor = {b["id"]: rng.uniform(0.6, 1.4) for b in catalog.branches}
    rows = []
    for product in catalog.products:
        popularity = rng.gamma(shape=4.0, scale=1.6)
        season = _season(product.get("categoryName") or "", woy)
        price_effect = (product["price"] / median_price) ** -0.3
        for branch in catalog.branches:
            promo = rng.random(weeks) < 0.08
            discount = np.where(promo, rng.choice([0.1, 0.2, 0.3], weeks), 0.0)
            lam = popularity * branch_factor[branch["id"]] * season * trend * price_effect * (1 + 2 * discount)
            # Ruido sobredisperso (Poisson-Gamma) como en ventas reales de tienda.
            units = rng.poisson(lam * rng.gamma(shape=8.0, scale=1 / 8.0, size=weeks))
            for i, week in enumerate(week_index):
                rows.append(
                    (
                        week,
                        product["id"],
                        branch["id"],
                        product.get("categoryId") or 0,
                        product["price"],
                        float(discount[i]),
                        int(units[i]),
                    )
                )
    sales = pd.DataFrame(
        rows, columns=["week", "productId", "branchId", "categoryId", "price", "discount", "units"]
    )

    anomalies: dict[tuple[int, pd.Timestamp], str] = {}
    # Las primeras 8 semanas no tienen historia suficiente para compararlas.
    for branch in catalog.branches:
        for week in week_index[8:]:
            if rng.random() < anomaly_rate:
                kind = "spike" if rng.random() < 0.5 else "drop"
                mask = (sales["branchId"] == branch["id"]) & (sales["week"] == week)
                factor = rng.uniform(2.8, 3.5) if kind == "spike" else rng.uniform(0.1, 0.25)
                sales.loc[mask, "units"] = np.round(sales.loc[mask, "units"] * factor).astype(int)
                anomalies[(branch["id"], week)] = kind

    profiles = list(CUSTOMER_PROFILES)
    weights = np.array([CUSTOMER_PROFILES[p][0] for p in profiles])
    assigned = rng.choice(profiles, size=customers, p=weights / weights.sum())
    start = week_index[0]
    period_days = weeks * 7
    tx = []
    customer_profiles: dict[int, str] = {}
    for cid, profile in enumerate(assigned, start=1):
        _, rate, ticket, active_until = CUSTOMER_PROFILES[profile]
        customer_profiles[cid] = str(profile)
        active_days = int(period_days * active_until)
        count = max(1, rng.poisson(rate * active_days / 7))
        offsets = np.sort(rng.integers(0, active_days, count))
        amounts = rng.lognormal(np.log(ticket), 0.35, count)
        for off, amount in zip(offsets, amounts):
            tx.append((cid, start + pd.Timedelta(days=int(off)), float(round(amount, 2))))
    transactions = pd.DataFrame(tx, columns=["customerId", "date", "amount"])
    return SyntheticData(
        sales=sales,
        transactions=transactions,
        anomalies=anomalies,
        customer_profiles=customer_profiles,
        as_of=end + pd.Timedelta(days=7),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--weeks", type=int, default=104)
    parser.add_argument("--customers", type=int, default=400)
    parser.add_argument("--end-week", type=date.fromisoformat, default=None)
    parser.add_argument("--out", type=Path, default=Path("data"))
    args = parser.parse_args()
    data = generate(args.seed, args.weeks, args.customers, end_week=args.end_week)
    args.out.mkdir(parents=True, exist_ok=True)
    data.sales.to_csv(args.out / "sales_weekly.csv", index=False)
    data.transactions.to_csv(args.out / "transactions.csv", index=False)
    print(f"{len(data.sales)} filas de ventas, {len(data.transactions)} compras, {len(data.anomalies)} anomalias")


if __name__ == "__main__":
    main()
