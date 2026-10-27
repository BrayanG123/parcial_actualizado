"""Seleccion de variables y preprocesamiento del modelo de demanda.

Objetivo: unidades vendidas de un producto en una sucursal durante una semana.

Variables elegidas y por que:

* ``lag_1``, ``lag_2``, ``lag_4``: ventas de 1, 2 y 4 semanas antes. La demanda de ropa tiene
  inercia; son las variables mas informativas y evitan usar el id del producto (alta
  cardinalidad, no generaliza a productos nuevos).
* ``roll_mean_4`` y ``roll_std_4``: nivel y volatilidad recientes (ventana de 4 semanas, solo
  con semanas pasadas para no filtrar el futuro).
* ``roll_mean_12``: nivel de largo plazo (popularidad del producto en la sucursal); estabiliza
  la prediccion frente a semanas atipicas.
* ``woy_sin`` y ``woy_cos``: semana del ano en forma ciclica (la semana 52 queda junto a la 1).
* ``is_december`` y ``is_mothers_day``: picos comerciales conocidos en Bolivia.
* ``discount`` y ``price_rel``: promocion y precio relativo a la mediana de su categoria.
* ``categoryId`` y ``branchId``: categoricas codificadas one-hot (pocas categorias y sucursales).

Descartadas: ``productId`` (cardinalidad alta), ``price`` absoluto (redundante con
``price_rel``) y cualquier variable de la misma semana distinta del precio/descuento (no se
conoce al predecir). Las filas sin las 12 semanas de historia necesarias se eliminan.
``VarianceThreshold`` quita variables constantes (por ejemplo, ``discount`` sin promociones).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

NUMERIC = [
    "lag_1",
    "lag_2",
    "lag_4",
    "roll_mean_4",
    "roll_std_4",
    "roll_mean_12",
    "woy_sin",
    "woy_cos",
    "is_december",
    "is_mothers_day",
    "discount",
    "price_rel",
]
CATEGORICAL = ["categoryId", "branchId"]
FEATURES = NUMERIC + CATEGORICAL
SERIES = ["productId", "branchId"]
MIN_HISTORY = 12


def calendar_features(weeks: pd.Series) -> pd.DataFrame:
    woy = pd.to_datetime(weeks).dt.isocalendar().week.astype(float).clip(1, 52)
    return pd.DataFrame(
        {
            "woy_sin": np.sin(2 * np.pi * woy / 52),
            "woy_cos": np.cos(2 * np.pi * woy / 52),
            "is_december": (woy >= 49).astype(float),
            "is_mothers_day": ((woy >= 20) & (woy <= 22)).astype(float),
        },
        index=weeks.index,
    )


def complete_weeks(sales: pd.DataFrame) -> pd.DataFrame:
    """Rellena con 0 las semanas sin ventas de cada serie (datos reales vienen dispersos)."""
    sales = sales.copy()
    sales["week"] = pd.to_datetime(sales["week"])
    weeks = pd.date_range(sales["week"].min(), sales["week"].max(), freq="7D")
    attrs = (
        sales.sort_values("week")
        .groupby(SERIES, as_index=False)
        .agg(categoryId=("categoryId", "last"), price=("price", "last"))
    )
    grid = attrs.merge(pd.DataFrame({"week": weeks}), how="cross")
    merged = grid.merge(
        sales[SERIES + ["week", "units", "discount"]], on=SERIES + ["week"], how="left"
    )
    merged["units"] = merged["units"].fillna(0).astype(float)
    merged["discount"] = merged["discount"].fillna(0.0)
    return merged


def add_features(sales: pd.DataFrame) -> pd.DataFrame:
    """Agrega rezagos, ventanas y calendario; devuelve todas las filas (con NaN al inicio)."""
    df = sales.sort_values(SERIES + ["week"]).reset_index(drop=True)
    grouped = df.groupby(SERIES)["units"]
    for lag in (1, 2, 4):
        df[f"lag_{lag}"] = grouped.shift(lag)
    shifted = grouped.shift(1)
    df["roll_mean_4"] = shifted.groupby([df[c] for c in SERIES]).transform(
        lambda s: s.rolling(4).mean()
    )
    df["roll_std_4"] = shifted.groupby([df[c] for c in SERIES]).transform(
        lambda s: s.rolling(4).std()
    )
    df["roll_mean_12"] = shifted.groupby([df[c] for c in SERIES]).transform(
        lambda s: s.rolling(12).mean()
    )
    median = df.groupby("categoryId")["price"].transform("median").replace(0, np.nan)
    df["price_rel"] = (df["price"] / median).fillna(1.0)
    df = pd.concat([df, calendar_features(df["week"])], axis=1)
    return df


def training_frame(sales: pd.DataFrame) -> pd.DataFrame:
    """Filas con historia completa listas para entrenar."""
    return add_features(complete_weeks(sales)).dropna(subset=["lag_4", "roll_std_4", "roll_mean_12"])
