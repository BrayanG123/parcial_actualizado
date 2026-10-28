from datetime import date

import pandas as pd

from app.synthetic import Catalog, generate


def test_es_reproducible_con_la_misma_semilla():
    a = generate(7, weeks=40, customers=60, end_week=date(2026, 10, 19))
    b = generate(7, weeks=40, customers=60, end_week=date(2026, 10, 19))
    pd.testing.assert_frame_equal(a.sales, b.sales)
    pd.testing.assert_frame_equal(a.transactions, b.transactions)
    assert a.anomalies == b.anomalies
    c = generate(8, weeks=40, customers=60, end_week=date(2026, 10, 19))
    assert not a.sales["units"].equals(c.sales["units"])


def test_respeta_la_forma_del_catalogo_de_la_empresa():
    catalog = Catalog(
        branches=[{"id": 11}, {"id": 12}],
        products=[{"id": 501, "categoryId": 9, "categoryName": "Chaquetas", "price": 300.0}],
    )
    data = generate(1, weeks=52, customers=30, catalog=catalog, end_week=date(2026, 10, 19))
    assert set(data.sales["productId"]) == {501}
    assert set(data.sales["branchId"]) == {11, 12}
    assert data.sales["week"].max() == pd.Timestamp("2026-10-19")
    assert data.sales["week"].nunique() == 52
    assert (data.sales["units"] >= 0).all()
    # Estacionalidad: la chaqueta vende mas en invierno (junio-julio) que en verano.
    by_week = data.sales.assign(month=data.sales["week"].dt.month).groupby("month")["units"].mean()
    assert by_week.loc[[6, 7]].mean() > by_week.loc[[1, 2]].mean()
