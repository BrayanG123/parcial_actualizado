-- Cupo offline: unidades apartadas para que una caja venda sin conexion sin que otra
-- caja o la tienda en linea vendan esas mismas unidades.

-- CreateEnum
CREATE TYPE "OfflineQuotaStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "cupos_offline" (
    "id_empresa" INTEGER NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::integer,
    "id_cupo" SERIAL NOT NULL,
    "id_sucursal" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_turno" INTEGER NOT NULL,
    "id_dispositivo" UUID NOT NULL,
    "estado" "OfflineQuotaStatus" NOT NULL DEFAULT 'ACTIVE',
    "fecha_vencimiento" TIMESTAMPTZ(3) NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_liberacion" TIMESTAMPTZ(3),

    CONSTRAINT "cupos_offline_pkey" PRIMARY KEY ("id_cupo")
);

-- CreateTable
CREATE TABLE "detalles_cupo_offline" (
    "id_empresa" INTEGER NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::integer,
    "id_detalle_cupo" SERIAL NOT NULL,
    "id_cupo" INTEGER NOT NULL,
    "id_inventario" INTEGER NOT NULL,
    "cantidad_apartada" INTEGER NOT NULL,
    "cantidad_vendida" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "detalles_cupo_offline_pkey" PRIMARY KEY ("id_detalle_cupo"),
    CONSTRAINT "detalles_cupo_offline_cantidades_check" CHECK ("cantidad_apartada" >= 0 AND "cantidad_vendida" >= 0 AND "cantidad_vendida" <= "cantidad_apartada")
);

-- CreateIndex
CREATE INDEX "cupos_offline_id_empresa_estado_fecha_vencimiento_idx" ON "cupos_offline"("id_empresa", "estado", "fecha_vencimiento");
CREATE INDEX "cupos_offline_id_empresa_id_usuario_id_dispositivo_estado_idx" ON "cupos_offline"("id_empresa", "id_usuario", "id_dispositivo", "estado");
CREATE INDEX "cupos_offline_id_turno_idx" ON "cupos_offline"("id_turno");
CREATE UNIQUE INDEX "detalles_cupo_offline_id_cupo_id_inventario_key" ON "detalles_cupo_offline"("id_cupo", "id_inventario");
CREATE INDEX "detalles_cupo_offline_id_empresa_idx" ON "detalles_cupo_offline"("id_empresa");
CREATE INDEX "detalles_cupo_offline_id_inventario_idx" ON "detalles_cupo_offline"("id_inventario");

-- AddForeignKey
ALTER TABLE "cupos_offline" ADD CONSTRAINT "cupos_offline_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cupos_offline" ADD CONSTRAINT "cupos_offline_id_turno_fkey" FOREIGN KEY ("id_turno") REFERENCES "turnos_caja"("id_turno") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalles_cupo_offline" ADD CONSTRAINT "detalles_cupo_offline_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalles_cupo_offline" ADD CONSTRAINT "detalles_cupo_offline_id_cupo_fkey" FOREIGN KEY ("id_cupo") REFERENCES "cupos_offline"("id_cupo") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalles_cupo_offline" ADD CONSTRAINT "detalles_cupo_offline_id_inventario_fkey" FOREIGN KEY ("id_inventario") REFERENCES "inventarios"("id_inventario") ON DELETE RESTRICT ON UPDATE CASCADE;
