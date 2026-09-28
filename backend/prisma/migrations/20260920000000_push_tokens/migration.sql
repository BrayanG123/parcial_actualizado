-- CreateTable
CREATE TABLE "tokens_push" (
    "id_token_push" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "plataforma" VARCHAR(20) NOT NULL DEFAULT 'WEB',
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tokens_push_pkey" PRIMARY KEY ("id_token_push")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_push_token_key" ON "tokens_push"("token");

-- CreateIndex
CREATE INDEX "tokens_push_id_usuario_idx" ON "tokens_push"("id_usuario");

-- AddForeignKey
ALTER TABLE "tokens_push" ADD CONSTRAINT "tokens_push_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
