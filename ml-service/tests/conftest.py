import pytest
from fastapi.testclient import TestClient

TOKEN = "token-de-prueba"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("ML_MODELS_DIR", str(tmp_path))
    from app.main import app

    return TestClient(app)


@pytest.fixture
def auth():
    return {"X-Internal-Token": TOKEN}
