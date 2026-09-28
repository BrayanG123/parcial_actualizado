ALTER TYPE "InventoryMovementType" ADD VALUE 'CHECKOUT_HOLD';
ALTER TYPE "InventoryMovementType" ADD VALUE 'CHECKOUT_RELEASE';

ALTER TABLE "detalles_reserva" ADD COLUMN "cantidad_comprada" INTEGER NOT NULL DEFAULT 0;
UPDATE "detalles_reserva" SET "cantidad_comprada" = "cantidad" WHERE "estado" = 'PURCHASED';
ALTER TABLE "detalles_reserva" ADD CONSTRAINT "detalles_reserva_compra_check"
  CHECK ("cantidad_comprada" >= 0 AND "cantidad_comprada" <= "cantidad");

ALTER TABLE "ventas"
  ADD COLUMN "id_carrito" INTEGER,
  ADD COLUMN "id_usuario_creador" INTEGER,
  ADD COLUMN "clave_idempotencia" UUID,
  ADD COLUMN "hash_solicitud" VARCHAR(64),
  ADD COLUMN "moneda" VARCHAR(3) NOT NULL DEFAULT 'BOB',
  ADD COLUMN "stock_apartado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fecha_vencimiento" TIMESTAMPTZ(3),
  ADD COLUMN "fecha_confirmacion" TIMESTAMPTZ(3),
  ADD COLUMN "motivo_cancelacion" VARCHAR(100);
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_carrito_fkey"
  FOREIGN KEY ("id_carrito") REFERENCES "carritos"("id_carrito") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_usuario_creador_fkey"
  FOREIGN KEY ("id_usuario_creador") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_apartado_check"
  CHECK (NOT "stock_apartado" OR ("estado" = 'PENDING_PAYMENT' AND "fecha_vencimiento" IS NOT NULL AND "id_sucursal" IS NOT NULL));
CREATE UNIQUE INDEX "ventas_id_carrito_key" ON "ventas"("id_carrito");
CREATE UNIQUE INDEX "ventas_id_usuario_creador_clave_idempotencia_key" ON "ventas"("id_usuario_creador", "clave_idempotencia");
CREATE INDEX "ventas_estado_fecha_vencimiento_idx" ON "ventas"("estado", "fecha_vencimiento");

ALTER TABLE "detalles_venta"
  ADD COLUMN "nombre_producto" VARCHAR(160),
  ADD COLUMN "nombre_talla" VARCHAR(30),
  ADD COLUMN "nombre_color" VARCHAR(60);
UPDATE "detalles_venta" d SET "nombre_producto" = p."nombre", "nombre_talla" = t."nombre", "nombre_color" = c."nombre"
  FROM "productos" p, "tallas" t, "colores" c
  WHERE d."id_producto" = p."id_producto" AND d."id_talla" = t."id_talla" AND d."id_color" = c."id_color";
