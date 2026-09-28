ALTER TABLE "clientes" ADD COLUMN "mayorista" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sucursales" ADD COLUMN "nombre_almacen" VARCHAR(120) NOT NULL DEFAULT 'Almacen principal';
ALTER TABLE "productos" ADD COLUMN "precio_mayorista" DECIMAL(12,2);
ALTER TABLE "productos" ADD COLUMN "imagenes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "productos" SET "imagenes" = ARRAY["imagen_url"] WHERE "imagen_url" IS NOT NULL AND "imagen_url" <> '';
ALTER TABLE "productos" ADD CONSTRAINT "productos_precio_mayorista_check"
  CHECK ("precio_mayorista" IS NULL OR ("precio_mayorista" > 0 AND "precio_mayorista" <= "precio"));
