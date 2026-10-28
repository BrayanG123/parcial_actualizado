from datetime import date

import pandas as pd
import pytest

from app import anomalies, demand, segmentation
from app.features import FEATURES, training_frame
from app.synthetic import generate


@pytest.fixture(scope="module")
def data():
    # 104 semanas: la historia por defecto con la que entrena el servicio.
    return generate(42, weeks=104, customers=300, end_week=date(2026, 10, 19))


def test_las_variables_solo_usan_el_pasado(data):
    frame = training_frame(data.sales)
    serie = frame[(frame.productId == 1) & (frame.branchId == 1)].sort_values("week")
    assert (serie["lag_1"].iloc[1:].to_numpy() == serie["units"].iloc[:-1].to_numpy()).all()
    assert frame[FEATURES].notna().all().all()


def test_demanda_supera_a_las_lineas_base(data):
    model = demand.train(data.sales)
    m = model.metrics
    assert m["crossValidation"]["method"] == "TimeSeriesSplit(5)"
    assert len(m["crossValidation"]["folds"]) == 5
    assert m["holdout"]["mae"] < m["baselines"]["lastWeek"]["mae"]
    assert m["holdout"]["mae"] < m["baselines"]["mean4Weeks"]["mae"]
    assert m["beatsBaselines"] is True
    assert m["crossValidation"]["mean"]["r2"] > 0.2
    series, totals = model.forecast(3, product_ids=[1, 2])
    assert set(series["productId"]) == {1, 2}
    assert len(totals) == 3
    assert (series["low"] <= series["units"]).all() and (series["units"] <= series["high"]).all()
    assert totals["week"].iloc[0] == pd.Timestamp("2026-10-26")


def test_demanda_rechaza_historia_insuficiente(data):
    with pytest.raises(demand.InsufficientDataError):
        demand.train(data.sales[data.sales.week >= "2026-08-01"])


def test_segmentacion_rfm_elige_k_y_se_parece_a_los_perfiles(data):
    seg = segmentation.train(data.transactions, data.as_of, truth=data.customer_profiles)
    m = seg.metrics
    assert 3 <= m["chosenK"] <= 6
    assert [c["k"] for c in m["candidates"]] == [2, 3, 4, 5, 6]
    assert m["silhouette"] > 0.3
    assert m["adjustedRandVsProfiles"] > 0.3
    assert sum(s["customers"] for s in seg.summary) == 300
    # El primer segmento es el de mayor valor y el ultimo el de mayor recencia.
    assert seg.summary[0]["avgMonetary"] == max(s["avgMonetary"] for s in seg.summary)
    assert seg.summary[-1]["avgRecencyDays"] == max(s["avgRecencyDays"] for s in seg.summary)


def test_anomalias_detecta_las_semanas_inyectadas(data):
    result = anomalies.detect(data.sales, truth=data.anomalies)
    assert result.metrics["injected"] > 0
    assert result.metrics["recall"] >= 0.7
    assert result.metrics["precision"] >= 0.5
