ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

ALTER TABLE "pagos"
  ADD COLUMN "stripe_request_key" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "stripe_intent_id" VARCHAR(200),
  ADD COLUMN "stripe_status" VARCHAR(40),
  ADD COLUMN "stripe_refund_id" VARCHAR(200),
  ADD COLUMN "stripe_refund_status" VARCHAR(40),
  ADD COLUMN "reembolso_solicitado_en" TIMESTAMPTZ(3),
  ADD COLUMN "stripe_sincronizado_en" TIMESTAMPTZ(3);
ALTER TABLE "pagos" ALTER COLUMN "stripe_request_key" DROP DEFAULT;
CREATE UNIQUE INDEX "pagos_stripe_request_key_key" ON "pagos"("stripe_request_key");
CREATE UNIQUE INDEX "pagos_stripe_intent_id_key" ON "pagos"("stripe_intent_id");
CREATE UNIQUE INDEX "pagos_stripe_refund_id_key" ON "pagos"("stripe_refund_id");
CREATE INDEX "pagos_estado_stripe_sincronizado_en_idx" ON "pagos"("estado", "stripe_sincronizado_en");
