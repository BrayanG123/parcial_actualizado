from datetime import date

from app.synthetic import generate


def test_salud_sin_token(client):
    assert client.get("/health").json()["status"] == "ok"


def test_exige_token_interno(client, auth, monkeypatch):
    assert client.get("/v1/tenants/1/metrics").status_code == 401
    assert client.get("/v1/tenants/1/metrics", headers={"X-Internal-Token": "otro"}).status_code == 401
    monkeypatch.setenv("ML_SERVICE_TOKEN", "")
    assert client.get("/v1/tenants/1/metrics", headers=auth).json()["code"] == "ML_TOKEN_NOT_CONFIGURED"


def test_entrena_con_la_forma_del_catalogo_y_aisla_empresas(client, auth):
    catalog = {
        "branches": [{"id": 3, "name": "Centro"}, {"id": 4}],
        "products": [{"id": p, "categoryId": 1 + p % 3, "price": 100 + p} for p in range(10, 22)],
    }
    body = {"source": "synthetic", "seed": 5, "weeks": 60, "customers": 120, "catalog": catalog, "asOf": "2026-10-27"}
    trained = client.post("/v1/tenants/1/train", json=body, headers=auth)
    assert trained.status_code == 200, trained.text
    assert {k: v["status"] for k, v in trained.json()["parts"].items()} == {
        "demand": "TRAINED",
        "segmentation": "TRAINED",
        "anomalies": "TRAINED",
    }
    forecast = client.post("/v1/tenants/1/forecast", json={"horizon": 2, "top": 5}, headers=auth).json()
    assert forecast["lastObservedWeek"] == "2026-10-19"
    assert [t["week"] for t in forecast["totals"]] == ["2026-10-26", "2026-11-02"]
    assert len(forecast["top"]) == 5
    assert {s["branchId"] for s in forecast["top"]} <= {3, 4}
    assert {s["productId"] for s in forecast["top"]} <= set(range(10, 22))
    segments = client.get("/v1/tenants/1/segments?assignments=true", headers=auth).json()
    assert len(segments["assignments"]) == 120
    assert client.get("/v1/tenants/1/anomalies", headers=auth).json()["metrics"]["model"] == "IsolationForest"
    # Otra empresa no ve el modelo de la primera.
    assert client.get("/v1/tenants/2/metrics", headers=auth).json()["code"] == "MODEL_NOT_TRAINED"
    # Mismo pedido, mismo resultado (semilla).
    again = client.post("/v1/tenants/1/train", json=body, headers=auth).json()
    assert again["parts"]["demand"]["metrics"]["holdout"] == trained.json()["parts"]["demand"]["metrics"]["holdout"]


def test_datos_reales_insuficientes_entrenan_solo_lo_posible(client, auth):
    data = generate(3, weeks=60, customers=50, end_week=date(2026, 10, 19))
    # Pocas ventas sueltas (sin historia suficiente) pero clientes suficientes.
    sales = data.sales.head(40).assign(week=lambda d: d.week.dt.date.astype(str)).to_dict(orient="records")
    tx = data.transactions.assign(date=lambda d: d.date.dt.date.astype(str)).to_dict(orient="records")
    res = client.post("/v1/tenants/7/train", json={"source": "provided", "sales": sales, "transactions": tx}, headers=auth)
    assert res.status_code == 200, res.text
    parts = res.json()["parts"]
    assert parts["demand"]["status"] == "INSUFFICIENT_DATA"
    assert parts["segmentation"]["status"] == "TRAINED"
    assert client.post("/v1/tenants/7/forecast", json={}, headers=auth).json()["code"] == "PART_NOT_TRAINED"
    none = client.post("/v1/tenants/8/train", json={"source": "provided", "sales": sales[:5]}, headers=auth)
    assert none.status_code == 422 and none.json()["code"] == "INSUFFICIENT_DATA"


def test_valida_entradas_sin_eco_de_datos(client, auth):
    bad = client.post("/v1/tenants/1/train", json={"source": "provided"}, headers=auth)
    assert bad.status_code == 422 and bad.json()["code"] == "VALIDATION_ERROR"
    huge = {"source": "synthetic", "catalog": {"branches": [{"id": i} for i in range(1, 101)], "products": [{"id": i, "price": 10} for i in range(1, 101)]}}
    assert client.post("/v1/tenants/1/train", json=huge, headers=auth).status_code == 422
    assert client.get("/v1/tenants/0/metrics", headers=auth).status_code == 422
