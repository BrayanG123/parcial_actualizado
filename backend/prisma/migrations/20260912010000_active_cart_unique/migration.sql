-- Preserve converted/abandoned carts, but allow only one active cart per customer.
-- Existing duplicate active carts must be reconciled explicitly before applying.
CREATE UNIQUE INDEX "carritos_cliente_activo_key"
  ON "carritos" ("id_cliente") WHERE "estado" = 'ACTIVE';
