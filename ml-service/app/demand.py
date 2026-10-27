"""Modelo supervisado: prediccion de demanda semanal por producto y sucursal.

RandomForestRegressor dentro de un Pipeline (one-hot para categoricas, VarianceThreshold para
variables constantes). La evaluacion respeta el orden temporal:

* validacion cruzada ``TimeSeriesSplit`` (5 particiones, siempre se entrena con el pasado y se
  valida con semanas posteriores);
* prueba final con las ultimas 8 semanas, comparada con dos lineas base ingenuas
  (repetir la semana anterior y promedio de 4 semanas).

Resultado observado con datos sinteticos: con unas 104 semanas de historia el bosque supera a
ambas lineas base; con menos de ~80 semanas queda parejo con el promedio de 4 semanas. Por eso
las metricas incluyen ``beatsBaselines`` y el dashboard lo muestra en lugar de ocultarlo.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_selection import VarianceThreshold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .features import CATEGORICAL, FEATURES, MIN_HISTORY, NUMERIC, SERIES, add_features, calendar_features, training_frame

HOLDOUT_WEEKS = 8
MIN_TRAIN_ROWS = 200


class InsufficientDataError(ValueError):
    pass


def build_pipeline(seed: int) -> Pipeline:
    pre = ColumnTransformer(
        [
            ("num", "passthrough", NUMERIC),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
        ],
        verbose_feature_names_out=False,
    )
    return Pipeline(
        [
            ("pre", pre),
            ("var", VarianceThreshold(0.0)),
            (
                "model",
                # Hojas de al menos 10 filas: con ventas ruidosas evita memorizar semanas atipicas.
                RandomForestRegressor(
                    n_estimators=200, min_samples_leaf=10, max_features=0.5, n_jobs=-1, random_state=seed
                ),
            ),
        ]
    )


def _scores(y_true, y_pred) -> dict:
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        "r2": round(float(r2_score(y_true, y_pred)), 3),
    }


def _split_by_weeks(frame: pd.DataFrame, n_splits: int):
    weeks = np.sort(frame["week"].unique())
    for train_idx, test_idx in TimeSeriesSplit(n_splits=n_splits).split(weeks):
        train = frame["week"].isin(weeks[train_idx])
        test = frame["week"].isin(weeks[test_idx])
        yield train.to_numpy(), test.to_numpy()


@dataclass
class DemandModel:
    pipeline: Pipeline
    history: pd.DataFrame  # ultimas semanas por serie (para predecir hacia adelante)
    metrics: dict

    def forecast(self, horizon: int, product_ids=None, branch_ids=None) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Prediccion recursiva semana a semana con intervalo 10-90 % de los arboles.

        Devuelve (series, totales). El intervalo del total se calcula sumando cada arbol sobre
        todas las series antes de tomar percentiles (sumar los percentiles lo exageraria).
        """
        hist = self.history
        if product_ids:
            hist = hist[hist["productId"].isin(product_ids)]
        if branch_ids:
            hist = hist[hist["branchId"].isin(branch_ids)]
        if hist.empty:
            empty = pd.DataFrame(columns=["week", "productId", "branchId", "units", "low", "high"])
            return empty, pd.DataFrame(columns=["week", "units", "low", "high"])
        state = hist.sort_values(SERIES + ["week"]).copy()
        last_week = state["week"].max()
        pre = self.pipeline[:-1]
        forest: RandomForestRegressor = self.pipeline[-1]
        out, totals = [], []
        for step in range(1, horizon + 1):
            week = last_week + pd.Timedelta(weeks=step)
            series = state.groupby(SERIES).tail(MIN_HISTORY).groupby(SERIES)
            rows = series.agg(
                categoryId=("categoryId", "last"),
                price_rel=("price_rel", "last"),
                lag_1=("units", lambda s: s.iloc[-1]),
                lag_2=("units", lambda s: s.iloc[-2]),
                lag_4=("units", lambda s: s.iloc[-4]),
                roll_mean_4=("units", lambda s: s.iloc[-4:].mean()),
                roll_std_4=("units", lambda s: s.iloc[-4:].std()),
                roll_mean_12=("units", "mean"),
            ).reset_index()
            rows["week"] = week
            rows["discount"] = 0.0  # sin promociones planificadas
            rows = pd.concat([rows, calendar_features(rows["week"])], axis=1)
            x = pre.transform(rows[FEATURES])
            trees = np.stack([t.predict(x) for t in forest.estimators_])
            rows["units"] = np.clip(trees.mean(axis=0), 0, None)
            rows["low"] = np.clip(np.percentile(trees, 10, axis=0), 0, None)
            rows["high"] = np.clip(np.percentile(trees, 90, axis=0), 0, None)
            out.append(rows[["week", "productId", "branchId", "units", "low", "high"]])
            total = np.clip(trees, 0, None).sum(axis=1)
            totals.append(
                {
                    "week": week,
                    "units": float(rows["units"].sum()),
                    "low": float(np.percentile(total, 10)),
                    "high": float(np.percentile(total, 90)),
                }
            )
            state = pd.concat([state, rows[["week", "productId", "branchId", "categoryId", "price_rel", "units"]]])
        return pd.concat(out, ignore_index=True), pd.DataFrame(totals)


def train(sales: pd.DataFrame, seed: int = 42) -> DemandModel:
    frame = training_frame(sales)
    if len(frame) < MIN_TRAIN_ROWS or frame["week"].nunique() < HOLDOUT_WEEKS + 10:
        raise InsufficientDataError(
            f"Se necesitan al menos {MIN_TRAIN_ROWS} filas y {HOLDOUT_WEEKS + 10} semanas con historia; hay {len(frame)} filas"
        )
    x, y = frame[FEATURES], frame["units"]

    folds = []
    for i, (tr, te) in enumerate(_split_by_weeks(frame, 5), start=1):
        model = build_pipeline(seed).fit(x[tr], y[tr])
        folds.append({"fold": i, "trainRows": int(tr.sum()), "testRows": int(te.sum()), **_scores(y[te], model.predict(x[te]))})
    cv = {k: round(float(np.mean([f[k] for f in folds])), 3) for k in ("mae", "rmse", "r2")}
    cv_std = {k: round(float(np.std([f[k] for f in folds])), 3) for k in ("mae", "rmse", "r2")}

    cut = np.sort(frame["week"].unique())[-HOLDOUT_WEEKS]
    train_mask = (frame["week"] < cut).to_numpy()
    test = frame[~train_mask]
    holdout_model = build_pipeline(seed).fit(x[train_mask], y[train_mask])
    holdout = _scores(test["units"], holdout_model.predict(test[FEATURES]))
    baselines = {
        "lastWeek": _scores(test["units"], test["lag_1"]),
        "mean4Weeks": _scores(test["units"], test["roll_mean_4"]),
    }

    pipeline = build_pipeline(seed).fit(x, y)
    names = pipeline[:-1].get_feature_names_out()
    importances = sorted(
        zip(names, pipeline[-1].feature_importances_), key=lambda item: item[1], reverse=True
    )
    history = add_features(frame[SERIES + ["week", "categoryId", "price", "discount", "units"]])
    history = history.groupby(SERIES).tail(MIN_HISTORY)[
        SERIES + ["week", "categoryId", "price_rel", "units"]
    ]
    metrics = {
        "model": "RandomForestRegressor",
        "target": "unidades por producto, sucursal y semana",
        "features": FEATURES,
        "rows": int(len(frame)),
        "series": int(frame.groupby(SERIES).ngroups),
        "weeks": int(frame["week"].nunique()),
        "crossValidation": {"method": "TimeSeriesSplit(5)", "mean": cv, "std": cv_std, "folds": folds},
        "holdout": {"weeks": HOLDOUT_WEEKS, **holdout},
        "baselines": baselines,
        "beatsBaselines": bool(
            holdout["mae"] < baselines["lastWeek"]["mae"] and holdout["mae"] < baselines["mean4Weeks"]["mae"]
        ),
        "improvementVsLastWeek": round(1 - holdout["mae"] / baselines["lastWeek"]["mae"], 3)
        if baselines["lastWeek"]["mae"]
        else None,
        "featureImportance": [{"feature": n, "importance": round(float(v), 4)} for n, v in importances[:12]],
    }
    return DemandModel(pipeline=pipeline, history=history.reset_index(drop=True), metrics=metrics)
