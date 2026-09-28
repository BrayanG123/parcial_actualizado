CREATE TABLE "lotes_offline" (
  "id" UUID PRIMARY KEY,
  "id_turno" INTEGER NOT NULL REFERENCES "turnos_caja"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id_dispositivo" UUID NOT NULL,
  "fecha_preparacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_finalizacion" TIMESTAMPTZ(3),
  "catalogo" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "lotes_offline_id_turno_idx" ON "lotes_offline"("id_turno");
CREATE UNIQUE INDEX "lotes_offline_turno_abierto_key" ON "lotes_offline"("id_turno") WHERE "fecha_finalizacion" IS NULL;
ALTER TABLE "ventas" ADD COLUMN "id_lote_offline" UUID REFERENCES "lotes_offline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ventas_id_lote_offline_idx" ON "ventas"("id_lote_offline");
