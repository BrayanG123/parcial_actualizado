ALTER TABLE "reservas" ADD COLUMN "fecha_vencimiento" TIMESTAMPTZ(3);

-- Existing appointments expire at the next midnight in Bolivia.
UPDATE "reservas"
SET "fecha_vencimiento" =
  (date_trunc('day', "horario_aproximado" AT TIME ZONE 'America/La_Paz')
    + INTERVAL '1 day') AT TIME ZONE 'America/La_Paz';

ALTER TABLE "reservas" ALTER COLUMN "fecha_vencimiento" SET NOT NULL;
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_vencimiento_check"
  CHECK ("fecha_vencimiento" > "horario_aproximado");
CREATE INDEX "reservas_estado_fecha_vencimiento_idx"
  ON "reservas"("estado", "fecha_vencimiento");
