-- Planes publicos de la landing SaaS: Gratuito, Basico (USD 99/mes) y Profesional (USD 199/mes).
-- Solo datos: los valores siguen siendo configurables desde la plataforma (PATCH /platform/plans/:id).
INSERT INTO "planes" ("codigo", "nombre", "descripcion", "max_sucursales_activas", "funcionalidades", "precio_mensual", "fecha_actualizacion")
VALUES
  ('FREE', 'Gratuito', '1 sucursal activa para empezar, sin reportes generativos con IA ni analitica.', 1,
   '{"products": true, "sales": true, "reservations": true, "offline": true, "conventionalReports": true, "aiReports": false, "mlAnalytics": false}', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- Precio de los planes existentes solo si nadie lo configuro todavia (seguian en 0).
UPDATE "planes" SET "precio_mensual" = 99, "fecha_actualizacion" = CURRENT_TIMESTAMP
WHERE "codigo" = 'BASIC' AND "precio_mensual" = 0;
UPDATE "planes" SET "precio_mensual" = 199, "fecha_actualizacion" = CURRENT_TIMESTAMP
WHERE "codigo" = 'PROFESSIONAL' AND "precio_mensual" = 0;
