ALTER TABLE "usuarios" ADD COLUMN "id_proveedor" INTEGER;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_proveedor_fkey"
  FOREIGN KEY ("id_proveedor") REFERENCES "proveedores"("id_proveedor") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "usuarios_id_proveedor_idx" ON "usuarios"("id_proveedor");
ALTER TABLE "productos" ADD COLUMN "disponibilidad_proveedor" VARCHAR(500);
