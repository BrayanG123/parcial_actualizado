"""Modelo no supervisado 1: segmentacion de clientes RFM con K-Means.

Variables por cliente (a la fecha de corte):

* Recencia: dias desde la ultima compra.
* Frecuencia: cantidad de compras.
* Monto: importe total en Bs.

Las tres tienen colas largas, por eso se aplica ``log1p`` y luego ``StandardScaler`` (K-Means
usa distancias euclidianas y sin escalar dominaria el monto). Se evalua k = 2..6 y se informan
silueta, Davies-Bouldin (menor es mejor) y Calinski-Harabasz (mayor es mejor).

Eleccion de k: la silueta suele favorecer k = 2 (clientes activos contra inactivos), que no
sirve para acciones comerciales. Por eso se exigen al menos 3 segmentos y, entre k = 3..6, se
toma el menor k cuya silueta este a ``SILHOUETTE_TOLERANCE`` o menos de la mejor (parsimonia). Cuando los datos son sinteticos se compara contra el perfil
latente con el indice de Rand ajustado (ARI).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, calinski_harabasz_score, davies_bouldin_score, silhouette_score
from sklearn.preprocessing import StandardScaler

MIN_CUSTOMERS = 20
MIN_K = 3
SILHOUETTE_TOLERANCE = 0.02
NAMES = {
    2: ["Activos", "En riesgo"],
    3: ["VIP", "Regulares", "En riesgo"],
    4: ["VIP", "Leales", "Ocasionales", "En riesgo"],
    5: ["VIP", "Leales", "Regulares", "Ocasionales", "En riesgo"],
    6: ["VIP", "Leales", "Regulares", "Ocasionales", "En riesgo", "Perdidos"],
}
ACTIONS = {
    "VIP": "Atencion preferente y lanzamientos anticipados.",
    "Leales": "Programa de puntos y recomendaciones personalizadas.",
    "Activos": "Mantener comunicacion de novedades.",
    "Regulares": "Promociones por categoria favorita para subir la frecuencia.",
    "Ocasionales": "Cupones de segunda compra con vencimiento corto.",
    "En riesgo": "Campana de reactivacion con descuento.",
    "Perdidos": "Encuesta y oferta de regreso; bajo costo de contacto.",
}


class InsufficientCustomersError(ValueError):
    pass


def rfm(transactions: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    tx = transactions.copy()
    tx["date"] = pd.to_datetime(tx["date"])
    table = tx.groupby("customerId").agg(
        last=("date", "max"), frequency=("date", "count"), monetary=("amount", "sum")
    )
    table["recency"] = (as_of - table["last"]).dt.days.clip(lower=0)
    return table[["recency", "frequency", "monetary"]]


@dataclass
class Segmentation:
    assignments: pd.DataFrame  # customerId, segment
    summary: list[dict]
    metrics: dict


def train(
    transactions: pd.DataFrame,
    as_of: pd.Timestamp,
    seed: int = 42,
    truth: dict[int, str] | None = None,
) -> Segmentation:
    table = rfm(transactions, as_of)
    if len(table) < MIN_CUSTOMERS:
        raise InsufficientCustomersError(
            f"Se necesitan al menos {MIN_CUSTOMERS} clientes con compras; hay {len(table)}"
        )
    scaler = StandardScaler()
    x = scaler.fit_transform(np.log1p(table.to_numpy(dtype=float)))
    candidates = []
    for k in range(2, min(6, len(table) - 1) + 1):
        model = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(x)
        candidates.append(
            {
                "k": k,
                "silhouette": round(float(silhouette_score(x, model.labels_)), 4),
                "daviesBouldin": round(float(davies_bouldin_score(x, model.labels_)), 4),
                "calinskiHarabasz": round(float(calinski_harabasz_score(x, model.labels_)), 1),
                "_model": model,
            }
        )
    eligible = [c for c in candidates if c["k"] >= MIN_K] or candidates
    top = max(c["silhouette"] for c in eligible)
    best = min(
        (c for c in eligible if c["silhouette"] >= top - SILHOUETTE_TOLERANCE), key=lambda c: c["k"]
    )
    model: KMeans = best["_model"]
    centers = model.cluster_centers_
    # Puntaje: recencia baja, frecuencia y monto altos (en escala estandarizada).
    score = -centers[:, 0] + centers[:, 1] + centers[:, 2]
    order = np.argsort(-score)
    names = NAMES[best["k"]]
    label_name = {int(cluster): names[rank] for rank, cluster in enumerate(order)}

    table = table.assign(segment=[label_name[int(c)] for c in model.labels_])
    summary = []
    for name in names:
        group = table[table["segment"] == name]
        if group.empty:
            continue
        summary.append(
            {
                "segment": name,
                "customers": int(len(group)),
                "share": round(len(group) / len(table), 3),
                "avgRecencyDays": round(float(group["recency"].mean()), 1),
                "avgFrequency": round(float(group["frequency"].mean()), 2),
                "avgMonetary": round(float(group["monetary"].mean()), 2),
                "totalMonetary": round(float(group["monetary"].sum()), 2),
                "action": ACTIONS[name],
            }
        )
    metrics = {
        "model": "KMeans",
        "features": ["recency", "frequency", "monetary"],
        "preprocessing": "log1p + StandardScaler",
        "customers": int(len(table)),
        "chosenK": best["k"],
        "selectionRule": f"menor k >= {MIN_K} con silueta a {SILHOUETTE_TOLERANCE} o menos de la mejor",
        "silhouette": best["silhouette"],
        "daviesBouldin": best["daviesBouldin"],
        "calinskiHarabasz": best["calinskiHarabasz"],
        "candidates": [{k: v for k, v in c.items() if k != "_model"} for c in candidates],
    }
    if truth:
        common = [cid for cid in table.index if cid in truth]
        metrics["adjustedRandVsProfiles"] = round(
            float(adjusted_rand_score([truth[c] for c in common], table.loc[common, "segment"])), 3
        )
    assignments = table.reset_index()[["customerId", "segment", "recency", "frequency", "monetary"]]
    return Segmentation(assignments=assignments, summary=summary, metrics=metrics)
