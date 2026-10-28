-- Parcial 2 (F7): cambios de prendas con plazo configurable por empresa y notas de
-- credito por diferencias a favor del cliente (aporte propio).

-- CreateEnum
CREATE TYPE "ExchangeSettlement" AS ENUM ('EVEN', 'CHARGED', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ACTIVE', 'USED', 'VOID');

-- AlterTable
ALTER TABLE "detalles_venta" ADD COLUMN     "cantidad_cambiada" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "plazo_cambio_dias" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "cambios" (
    "id_cambio" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::integer,
    "id_venta" INTEGER NOT NULL,
    "id_detalle_venta" INTEGER NOT NULL,
    "id_sucursal" INTEGER NOT NULL,
    "id_turno" INTEGER,
    "id_usuario_creador" INTEGER NOT NULL,
    "id_empleado" INTEGER,
    "clave_operacion" UUID,
    "cantidad" INTEGER NOT NULL,
    "id_producto_devuelto" INTEGER NOT NULL,
    "id_talla_devuelta" INTEGER NOT NULL,
    "id_color_devuelto" INTEGER NOT NULL,
    "precio_devuelto" DECIMAL(12,2) NOT NULL,
    "id_producto_nuevo" INTEGER NOT NULL,
    "id_talla_nueva" INTEGER NOT NULL,
    "id_color_nuevo" INTEGER NOT NULL,
    "nombre_producto_nuevo" VARCHAR(160) NOT NULL,
    "precio_nuevo" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "liquidacion" "ExchangeSettlement" NOT NULL,
    "motivo" VARCHAR(250),
    "fecha_cambio" TIMESTAMPTZ(3) NOT NULL,
    "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_pkey" PRIMARY KEY ("id_cambio")
);

-- CreateTable
CREATE TABLE "notas_credito" (
    "id_nota_credito" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::integer,
    "codigo" VARCHAR(20) NOT NULL,
    "id_cliente" INTEGER,
    "id_cambio" INTEGER,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "estado" "CreditNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "fecha_emision" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notas_credito_pkey" PRIMARY KEY ("id_nota_credito")
);

-- CreateIndex
CREATE INDEX "cambios_id_empresa_id_venta_idx" ON "cambios"("id_empresa", "id_venta");

-- CreateIndex
CREATE INDEX "cambios_id_detalle_venta_idx" ON "cambios"("id_detalle_venta");

-- CreateIndex
CREATE INDEX "cambios_id_sucursal_fecha_cambio_idx" ON "cambios"("id_sucursal", "fecha_cambio");

-- CreateIndex
CREATE UNIQUE INDEX "cambios_id_empresa_clave_operacion_key" ON "cambios"("id_empresa", "clave_operacion");

-- CreateIndex
CREATE UNIQUE INDEX "notas_credito_id_cambio_key" ON "notas_credito"("id_cambio");

-- CreateIndex
CREATE INDEX "notas_credito_id_empresa_id_cliente_idx" ON "notas_credito"("id_empresa", "id_cliente");

-- CreateIndex
CREATE UNIQUE INDEX "notas_credito_id_empresa_codigo_key" ON "notas_credito"("id_empresa", "codigo");

-- AddForeignKey
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_id_detalle_venta_fkey" FOREIGN KEY ("id_detalle_venta") REFERENCES "detalles_venta"("id_detalle_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_id_cambio_fkey" FOREIGN KEY ("id_cambio") REFERENCES "cambios"("id_cambio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridad: nunca se cambian mas unidades de las vendidas en la linea.
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_cantidad_cambiada_check"
  CHECK ("cantidad_cambiada" >= 0 AND "cantidad_cambiada" <= "cantidad");
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_cantidad_check" CHECK ("cantidad" > 0);
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_plazo_cambio_dias_check"
  CHECK ("plazo_cambio_dias" BETWEEN 0 AND 365);
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_saldo_check"
  CHECK ("saldo" >= 0 AND "saldo" <= "monto");
