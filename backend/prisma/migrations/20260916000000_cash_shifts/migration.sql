CREATE TABLE "cajas" (
  "id_caja" SERIAL PRIMARY KEY,
  "id_sucursal" INTEGER NOT NULL REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE,
  "nombre" VARCHAR(80) NOT NULL
);
CREATE UNIQUE INDEX "cajas_id_sucursal_nombre_key" ON "cajas"("id_sucursal", "nombre");
INSERT INTO "cajas" ("id_sucursal", "nombre") SELECT "id_sucursal", 'Caja 1' FROM "sucursales";
CREATE TABLE "turnos_caja" (
  "id_turno" SERIAL PRIMARY KEY,
  "id_caja" INTEGER NOT NULL REFERENCES "cajas"("id_caja") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id_usuario" INTEGER NOT NULL REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  "clave_apertura" UUID NOT NULL,
  "fecha_apertura" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_cierre" TIMESTAMPTZ(3),
  "moneda" VARCHAR(3) NOT NULL,
  "saldo_inicial" DECIMAL(14,2) NOT NULL CHECK ("saldo_inicial" >= 0),
  "ventas_efectivo" DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK ("ventas_efectivo" >= 0),
  "ventas_tarjeta" DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK ("ventas_tarjeta" >= 0),
  "ventas_qr" DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK ("ventas_qr" >= 0),
  "ventas_transferencia" DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK ("ventas_transferencia" >= 0),
  "cantidad_ventas" INTEGER NOT NULL DEFAULT 0 CHECK ("cantidad_ventas" >= 0),
  "efectivo_contado" DECIMAL(14,2),
  "observacion_cierre" VARCHAR(500),
  CONSTRAINT "turnos_caja_cierre_check" CHECK (
    ("fecha_cierre" IS NULL AND "efectivo_contado" IS NULL AND "observacion_cierre" IS NULL) OR
    ("fecha_cierre" IS NOT NULL AND "efectivo_contado" IS NOT NULL AND "efectivo_contado" >= 0 AND "fecha_cierre" >= "fecha_apertura")
  )
);
CREATE UNIQUE INDEX "turnos_caja_id_usuario_clave_apertura_key" ON "turnos_caja"("id_usuario", "clave_apertura");
CREATE UNIQUE INDEX "turnos_caja_usuario_abierto_key" ON "turnos_caja"("id_usuario") WHERE "fecha_cierre" IS NULL;
CREATE UNIQUE INDEX "turnos_caja_caja_abierta_key" ON "turnos_caja"("id_caja") WHERE "fecha_cierre" IS NULL;
CREATE INDEX "turnos_caja_id_caja_fecha_apertura_idx" ON "turnos_caja"("id_caja", "fecha_apertura");
CREATE INDEX "turnos_caja_id_usuario_fecha_apertura_idx" ON "turnos_caja"("id_usuario", "fecha_apertura");
ALTER TABLE "ventas" ADD COLUMN "id_turno" INTEGER REFERENCES "turnos_caja"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ventas_id_turno_idx" ON "ventas"("id_turno");
