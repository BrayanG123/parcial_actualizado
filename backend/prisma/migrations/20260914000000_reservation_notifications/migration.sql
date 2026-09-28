CREATE TABLE "notificaciones" (
  "id_notificacion" SERIAL NOT NULL,
  "id_sucursal" INTEGER NOT NULL,
  "id_reserva" INTEGER NOT NULL,
  "cantidad_prendas" INTEGER NOT NULL,
  "horario_aproximado" TIMESTAMPTZ(3) NOT NULL,
  "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id_notificacion"),
  CONSTRAINT "notificaciones_cantidad_prendas_check" CHECK ("cantidad_prendas" > 0),
  CONSTRAINT "notificaciones_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notificaciones_id_reserva_fkey" FOREIGN KEY ("id_reserva") REFERENCES "reservas"("id_reserva") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notificaciones_id_reserva_key" ON "notificaciones"("id_reserva");
CREATE INDEX "notificaciones_id_sucursal_fecha_creacion_id_notificacion_idx" ON "notificaciones"("id_sucursal", "fecha_creacion", "id_notificacion");
CREATE INDEX "notificaciones_fecha_creacion_id_notificacion_idx" ON "notificaciones"("fecha_creacion", "id_notificacion");

CREATE TABLE "lecturas_notificacion" (
  "id_notificacion" INTEGER NOT NULL,
  "id_usuario" INTEGER NOT NULL,
  "fecha_lectura" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lecturas_notificacion_pkey" PRIMARY KEY ("id_notificacion", "id_usuario"),
  CONSTRAINT "lecturas_notificacion_id_notificacion_fkey" FOREIGN KEY ("id_notificacion") REFERENCES "notificaciones"("id_notificacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lecturas_notificacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lecturas_notificacion_id_usuario_id_notificacion_idx" ON "lecturas_notificacion"("id_usuario", "id_notificacion");

-- Open reservations from an earlier installation also become visible in the inbox.
-- Keep their original creation timestamp; closed reservations are not backfilled.
INSERT INTO "notificaciones" ("id_sucursal", "id_reserva", "cantidad_prendas", "horario_aproximado", "fecha_creacion")
SELECT r."id_sucursal", r."id_reserva", SUM(d."cantidad")::integer, r."horario_aproximado", r."fecha_reserva"
FROM "reservas" r JOIN "detalles_reserva" d ON d."id_reserva" = r."id_reserva"
WHERE r."estado" IN ('PENDING', 'PREPARING', 'READY', 'CUSTOMER_PRESENT')
GROUP BY r."id_reserva", r."id_sucursal", r."horario_aproximado", r."fecha_reserva"
HAVING SUM(d."cantidad") > 0;
