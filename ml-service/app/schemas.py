"""Contratos de la API. Los limites evitan cargas excesivas desde el backend."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

MAX_ROWS = 300_000
Id = Field(ge=1, le=2_147_483_647)


class BranchIn(BaseModel):
    id: int = Id
    name: str | None = Field(default=None, max_length=120)


class ProductIn(BaseModel):
    id: int = Id
    name: str | None = Field(default=None, max_length=160)
    categoryId: int = Field(default=0, ge=0, le=2_147_483_647)
    categoryName: str | None = Field(default=None, max_length=100)
    price: float = Field(gt=0, le=1_000_000)


class CatalogIn(BaseModel):
    branches: list[BranchIn] = Field(min_length=1, max_length=100)
    products: list[ProductIn] = Field(min_length=1, max_length=2_000)

    @model_validator(mode="after")
    def series_limit(self):
        if len(self.branches) * len(self.products) > 5_000:
            raise ValueError("El catalogo genera demasiadas series (maximo 5000 producto-sucursal)")
        return self


class SaleRow(BaseModel):
    week: date
    productId: int = Id
    branchId: int = Id
    categoryId: int = Field(default=0, ge=0, le=2_147_483_647)
    price: float = Field(ge=0, le=1_000_000)
    discount: float = Field(default=0.0, ge=0, le=1)
    units: float = Field(ge=0, le=1_000_000)


class TransactionRow(BaseModel):
    customerId: int = Id
    date: date
    amount: float = Field(ge=0, le=10_000_000)


class TrainRequest(BaseModel):
    source: Literal["synthetic", "provided"]
    seed: int = Field(default=42, ge=0, le=2_147_483_647)
    weeks: int = Field(default=104, ge=30, le=156)
    customers: int = Field(default=400, ge=20, le=5_000)
    catalog: CatalogIn | None = None
    sales: list[SaleRow] = Field(default_factory=list, max_length=MAX_ROWS)
    transactions: list[TransactionRow] = Field(default_factory=list, max_length=MAX_ROWS)
    asOf: date | None = None

    @model_validator(mode="after")
    def provided_needs_data(self):
        if self.source == "provided" and not (self.sales or self.transactions):
            raise ValueError("Con source=provided se deben enviar ventas y/o compras")
        return self


class ForecastRequest(BaseModel):
    horizon: int = Field(default=4, ge=1, le=12)
    productIds: list[int] | None = Field(default=None, max_length=500)
    branchIds: list[int] | None = Field(default=None, max_length=100)
    top: int = Field(default=10, ge=1, le=100)
