-- Pagos de suscripciones SaaS con Stripe: el alta de una empresa de pago, una empresa nueva
-- de un dueño, el cambio de plan o la renovacion se aplican solo con el pago confirmado.

-- CreateEnum
CREATE TYPE "SubscriptionPaymentKind" AS ENUM ('SIGNUP', 'NEW_TENANT', 'CHANGE_PLAN', 'RENEW');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "pagos_suscripcion" (
    "id_pago_suscripcion" SERIAL NOT NULL,
    "clave_publica" UUID NOT NULL,
    "tipo" "SubscriptionPaymentKind" NOT NULL,
    "estado" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "id_empresa" INTEGER,
    "id_plan" INTEGER NOT NULL,
    "id_cuenta_propietario" INTEGER,
    "id_usuario" INTEGER,
    "meses" INTEGER NOT NULL DEFAULT 1,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" VARCHAR(3) NOT NULL,
    "datos_registro" JSONB,
    "stripe_intent_id" VARCHAR(200),
    "motivo_fallo" VARCHAR(250),
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_pago" TIMESTAMPTZ(3),

    CONSTRAINT "pagos_suscripcion_pkey" PRIMARY KEY ("id_pago_suscripcion"),
    CONSTRAINT "pagos_suscripcion_monto_check" CHECK ("monto" > 0 AND "meses" BETWEEN 1 AND 36)
);

-- CreateIndex
CREATE UNIQUE INDEX "pagos_suscripcion_clave_publica_key" ON "pagos_suscripcion"("clave_publica");
CREATE UNIQUE INDEX "pagos_suscripcion_stripe_intent_id_key" ON "pagos_suscripcion"("stripe_intent_id");
CREATE INDEX "pagos_suscripcion_estado_fecha_creacion_idx" ON "pagos_suscripcion"("estado", "fecha_creacion");
CREATE INDEX "pagos_suscripcion_id_empresa_idx" ON "pagos_suscripcion"("id_empresa");

-- AddForeignKey
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_id_plan_fkey" FOREIGN KEY ("id_plan") REFERENCES "planes"("id_plan") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_id_cuenta_propietario_fkey" FOREIGN KEY ("id_cuenta_propietario") REFERENCES "cuentas_propietario"("id_cuenta") ON DELETE SET NULL ON UPDATE CASCADE;
