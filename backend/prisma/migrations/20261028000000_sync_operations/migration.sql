-- Parcial 2 (F4.1): operaciones offline sincronizadas, su bitacora y clave de operacion
-- de las reservas offline (idempotencia por empresa).

-- CreateEnum
CREATE TYPE "SyncOperationType" AS ENUM ('SALE_CASH', 'RESERVATION', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "SyncOperationStatus" AS ENUM ('PROCESSING', 'CONFIRMED', 'REJECTED', 'CONFLICT');

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "clave_operacion" UUID;

-- CreateTable
CREATE TABLE "operaciones_sync" (
    "id_operacion_sync" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::integer,
    "id_operacion" UUID NOT NULL,
    "id_dispositivo" UUID NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_sucursal" INTEGER,
    "tipo" "SyncOperationType" NOT NULL,
    "estado" "SyncOperationStatus" NOT NULL,
    "datos" JSONB NOT NULL,
    "hash_datos" VARCHAR(64) NOT NULL,
    "fecha_local" TIMESTAMPTZ(3) NOT NULL,
    "fecha_recepcion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_proceso" TIMESTAMPTZ(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "codigo_resultado" VARCHAR(60),
    "mensaje_resultado" VARCHAR(500),
    "detalle_resultado" JSONB,
    "tipo_recurso" VARCHAR(30),
    "id_recurso" INTEGER,

    CONSTRAINT "operaciones_sync_pkey" PRIMARY KEY ("id_operacion_sync")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id_log_sync" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::integer,
    "id_operacion_sync" INTEGER NOT NULL,
    "intento" INTEGER NOT NULL,
    "estado" "SyncOperationStatus" NOT NULL,
    "codigo_error" VARCHAR(60),
    "latencia_ms" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id_log_sync")
);

-- CreateIndex
CREATE INDEX "operaciones_sync_id_empresa_id_usuario_id_dispositivo_idx" ON "operaciones_sync"("id_empresa", "id_usuario", "id_dispositivo");

-- CreateIndex
CREATE INDEX "operaciones_sync_id_empresa_estado_fecha_recepcion_idx" ON "operaciones_sync"("id_empresa", "estado", "fecha_recepcion");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_sync_id_empresa_id_operacion_key" ON "operaciones_sync"("id_empresa", "id_operacion");

-- CreateIndex
CREATE INDEX "sync_log_id_empresa_fecha_idx" ON "sync_log"("id_empresa", "fecha");

-- CreateIndex
CREATE INDEX "sync_log_id_operacion_sync_idx" ON "sync_log"("id_operacion_sync");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_id_empresa_clave_operacion_key" ON "reservas"("id_empresa", "clave_operacion");

-- AddForeignKey
ALTER TABLE "operaciones_sync" ADD CONSTRAINT "operaciones_sync_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_id_operacion_sync_fkey" FOREIGN KEY ("id_operacion_sync") REFERENCES "operaciones_sync"("id_operacion_sync") ON DELETE CASCADE ON UPDATE CASCADE;
