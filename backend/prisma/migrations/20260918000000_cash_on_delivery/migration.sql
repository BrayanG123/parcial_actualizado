ALTER TABLE "ventas"
  ADD COLUMN "contra_entrega" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "destinatario" VARCHAR(120),
  ADD COLUMN "telefono_entrega" VARCHAR(30),
  ADD COLUMN "direccion_entrega" VARCHAR(250),
  ADD COLUMN "fecha_entrega" TIMESTAMPTZ(3);
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_entrega_datos" CHECK (
  NOT "contra_entrega" OR
  ("destinatario" IS NOT NULL AND "telefono_entrega" IS NOT NULL AND "direccion_entrega" IS NOT NULL)
);
ALTER TABLE "ventas" DROP CONSTRAINT "ventas_apartado_check";
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_apartado_check" CHECK (
  NOT "stock_apartado" OR (
    "estado" = 'PENDING_PAYMENT' AND "id_sucursal" IS NOT NULL
    AND ("contra_entrega" OR "fecha_vencimiento" IS NOT NULL)
  )
);
