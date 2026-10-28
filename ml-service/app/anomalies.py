"""Modelo no supervisado 2: deteccion de semanas anomalas por sucursal (IsolationForest).

Se agregan las unidades por sucursal y semana y se describen con:

* ``ratio_median``: unidades / mediana de las 8 semanas previas (picos > 1, caidas < 1);
* ``log_ratio``: el mismo cociente en escala logaritmica (simetrico para picos y caidas);
* ``woy_sin`` y ``woy_cos``: estacionalidad, para no marcar diciembre como anomalo.

IsolationForest aisla los puntos raros con pocos cortes. Ademas se exige una desviacion de
negocio (``MIN_DEVIATION``): la semana debe al menos duplicar o caer a la mitad de la mediana
reciente. Sin esa regla los picos estacionales de diciembre (~1,7x) aparecian como falsos
positivos. Con datos sinteticos se conocen las
semanas inyectadas, por lo que se informan precision, exhaustividad (recall) y F1.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score

from .features import calendar_features

WINDOW = 8
CONTAMINATION = 0.03
MIN_DEVIATION = 2.0


@dataclass
class AnomalyResult:
    weeks: pd.DataFrame  # todas las semanas evaluadas
    metrics: dict

    def flagged(self) -> pd.DataFrame:
        return self.weeks[self.weeks["anomaly"]].sort_values("score")


def detect(
    sales: pd.DataFrame,
    seed: int = 42,
    truth: dict[tuple[int, pd.Timestamp], str] | None = None,
) -> AnomalyResult:
    weekly = sales.assign(week=pd.to_datetime(sales["week"])).groupby(["branchId", "week"], as_index=False)["units"].sum()
    weekly = weekly.sort_values(["branchId", "week"]).reset_index(drop=True)
    expected = weekly.groupby("branchId")["units"].transform(lambda s: s.shift(1).rolling(WINDOW).median())
    weekly["expected"] = expected
    weekly = weekly.dropna(subset=["expected"]).reset_index(drop=True)
    if len(weekly) < 20:
        return AnomalyResult(weekly.assign(anomaly=False, score=0.0, kind=None), {"model": "IsolationForest", "weeks": int(len(weekly)), "flagged": 0, "note": "Historia insuficiente"})
    ratio = (weekly["units"] + 1) / (weekly["expected"] + 1)
    features = pd.concat(
        [pd.DataFrame({"ratio_median": ratio, "log_ratio": np.log(ratio)}), calendar_features(weekly["week"])[["woy_sin", "woy_cos"]]],
        axis=1,
    )
    forest = IsolationForest(n_estimators=300, contamination=CONTAMINATION, random_state=seed).fit(features)
    weekly["score"] = forest.score_samples(features)
    deviates = (ratio >= MIN_DEVIATION) | (ratio <= 1 / MIN_DEVIATION)
    weekly["anomaly"] = (forest.predict(features) == -1) & deviates.to_numpy()
    weekly["kind"] = np.where(ratio >= 1, "spike", "drop")
    weekly.loc[~weekly["anomaly"], "kind"] = None
    metrics = {
        "model": "IsolationForest",
        "features": list(features.columns),
        "contamination": CONTAMINATION,
        "minDeviation": MIN_DEVIATION,
        "weeks": int(len(weekly)),
        "flagged": int(weekly["anomaly"].sum()),
    }
    if truth is not None:
        y_true = [(int(b), w) in truth for b, w in zip(weekly["branchId"], weekly["week"])]
        y_pred = weekly["anomaly"].tolist()
        metrics.update(
            {
                "injected": int(sum(y_true)),
                "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 3),
                "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 3),
                "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 3),
            }
        )
    return AnomalyResult(weekly, metrics)
