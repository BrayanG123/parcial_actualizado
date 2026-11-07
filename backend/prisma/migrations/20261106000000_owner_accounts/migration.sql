-- F14: cuentas globales de dueños. Un dueño puede tener varias empresas; en cada una actua
-- con el usuario administrador de esa empresa vinculado a su cuenta.
CREATE TABLE "cuentas_propietario" (
    "id_cuenta" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_propietario_pkey" PRIMARY KEY ("id_cuenta")
);
CREATE UNIQUE INDEX "cuentas_propietario_email_key" ON "cuentas_propietario"("email");

ALTER TABLE "usuarios" ADD COLUMN "id_cuenta_propietario" INTEGER;
CREATE INDEX "usuarios_id_cuenta_propietario_idx" ON "usuarios"("id_cuenta_propietario");
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_cuenta_propietario_fkey"
    FOREIGN KEY ("id_cuenta_propietario") REFERENCES "cuentas_propietario"("id_cuenta")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos existentes: cada administrador de empresa queda vinculado a una cuenta con su mismo
-- correo y contraseña. Si el mismo correo administra varias empresas, comparten la cuenta
-- (se usa la contraseña del administrador mas antiguo).
INSERT INTO "cuentas_propietario" ("nombre", "email", "password_hash")
SELECT DISTINCT ON (lower(u."email")) u."nombre", lower(u."email"), u."password_hash"
FROM "usuarios" u
JOIN "usuarios_roles" ur ON ur."id_usuario" = u."id_usuario"
JOIN "roles" r ON r."id_rol" = ur."id_rol"
WHERE r."nombre" = 'ADMINISTRATOR' AND u."id_empresa" IS NOT NULL AND u."activo"
ORDER BY lower(u."email"), u."id_usuario";

UPDATE "usuarios" u
SET "id_cuenta_propietario" = c."id_cuenta"
FROM "cuentas_propietario" c
WHERE lower(u."email") = c."email"
  AND u."id_empresa" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "usuarios_roles" ur JOIN "roles" r ON r."id_rol" = ur."id_rol"
    WHERE ur."id_usuario" = u."id_usuario" AND r."nombre" = 'ADMINISTRATOR'
  );
