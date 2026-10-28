-- Parcial 2 (F2.1-F2.3): SaaS multitenant con base compartida y aislamiento logico.
-- 1) Tablas de plataforma: empresas, planes, suscripciones e historial.
-- 2) Planes iniciales (valores del enunciado; configurables luego en la tabla planes).
-- 3) Todo lo existente pasa a la Empresa A (slug fashionstore, plan Profesional).
-- 4) id_empresa obligatorio en las entidades de negocio; uniques globales -> por empresa.

CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "SubscriptionAction" AS ENUM ('ASSIGN', 'CHANGE_PLAN', 'RENEW', 'SUSPEND', 'REACTIVATE', 'CANCEL', 'EXPIRE');
ALTER TYPE "RoleName" ADD VALUE 'PLATFORM_ADMIN';

CREATE TABLE "empresas" (
    "id_empresa" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "estado" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id_empresa")
);
CREATE TABLE "planes" (
    "id_plan" SERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(250),
    "max_sucursales_activas" INTEGER NOT NULL,
    "funcionalidades" JSONB NOT NULL DEFAULT '{}',
    "precio_mensual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id_plan")
);
CREATE TABLE "suscripciones" (
    "id_suscripcion" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "id_plan" INTEGER NOT NULL,
    "fecha_inicio" TIMESTAMPTZ(3) NOT NULL,
    "fecha_vencimiento" TIMESTAMPTZ(3) NOT NULL,
    "estado" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id_suscripcion")
);
CREATE TABLE "historial_suscripciones" (
    "id_historial" SERIAL NOT NULL,
    "id_suscripcion" INTEGER NOT NULL,
    "accion" "SubscriptionAction" NOT NULL,
    "id_plan_anterior" INTEGER,
    "id_plan_nuevo" INTEGER NOT NULL,
    "estado" "SubscriptionStatus" NOT NULL,
    "fecha_inicio" TIMESTAMPTZ(3) NOT NULL,
    "fecha_vencimiento" TIMESTAMPTZ(3) NOT NULL,
    "observacion" VARCHAR(250),
    "id_usuario" INTEGER,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_suscripciones_pkey" PRIMARY KEY ("id_historial")
);

CREATE UNIQUE INDEX "empresas_slug_key" ON "empresas"("slug");
CREATE UNIQUE INDEX "planes_codigo_key" ON "planes"("codigo");
CREATE UNIQUE INDEX "suscripciones_id_empresa_key" ON "suscripciones"("id_empresa");
CREATE INDEX "suscripciones_id_plan_idx" ON "suscripciones"("id_plan");
CREATE INDEX "suscripciones_estado_fecha_vencimiento_idx" ON "suscripciones"("estado", "fecha_vencimiento");
CREATE INDEX "historial_suscripciones_id_suscripcion_fecha_idx" ON "historial_suscripciones"("id_suscripcion", "fecha");

ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_id_plan_fkey" FOREIGN KEY ("id_plan") REFERENCES "planes"("id_plan") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historial_suscripciones" ADD CONSTRAINT "historial_suscripciones_id_suscripcion_fkey" FOREIGN KEY ("id_suscripcion") REFERENCES "suscripciones"("id_suscripcion") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "historial_suscripciones" ADD CONSTRAINT "historial_suscripciones_id_plan_anterior_fkey" FOREIGN KEY ("id_plan_anterior") REFERENCES "planes"("id_plan") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "historial_suscripciones" ADD CONSTRAINT "historial_suscripciones_id_plan_nuevo_fkey" FOREIGN KEY ("id_plan_nuevo") REFERENCES "planes"("id_plan") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "planes" ("codigo", "nombre", "descripcion", "max_sucursales_activas", "funcionalidades", "precio_mensual", "fecha_actualizacion")
VALUES
  ('BASIC', 'Basico', 'Hasta 2 sucursales activas, sin reportes generativos con IA.', 2,
   '{"products": true, "sales": true, "reservations": true, "offline": true, "conventionalReports": true, "aiReports": false, "mlAnalytics": false}', 0, CURRENT_TIMESTAMP),
  ('PROFESSIONAL', 'Profesional', 'Hasta 10 sucursales activas, con reportes generativos con IA.', 10,
   '{"products": true, "sales": true, "reservations": true, "offline": true, "conventionalReports": true, "aiReports": true, "mlAnalytics": true}', 0, CURRENT_TIMESTAMP);

INSERT INTO "empresas" ("nombre", "slug", "fecha_actualizacion")
VALUES ('FashionStore', 'fashionstore', CURRENT_TIMESTAMP);

INSERT INTO "suscripciones" ("id_empresa", "id_plan", "fecha_inicio", "fecha_vencimiento", "fecha_actualizacion")
SELECT e."id_empresa", p."id_plan", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year', CURRENT_TIMESTAMP
FROM "empresas" e, "planes" p
WHERE e."slug" = 'fashionstore' AND p."codigo" = 'PROFESSIONAL';

INSERT INTO "historial_suscripciones" ("id_suscripcion", "accion", "id_plan_nuevo", "estado", "fecha_inicio", "fecha_vencimiento", "observacion")
SELECT s."id_suscripcion", 'ASSIGN', s."id_plan", s."estado", s."fecha_inicio", s."fecha_vencimiento",
       'Migracion: datos del parcial 1 asignados a la Empresa A'
FROM "suscripciones" s;

-- id_empresa en cada tabla de negocio: columna, relleno con la Empresa A, NOT NULL, FK e indice.
DO $$
DECLARE
  empresa_a INTEGER := (SELECT "id_empresa" FROM "empresas" WHERE "slug" = 'fashionstore');
  tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['cajas', 'carritos', 'categorias', 'clientes', 'colecciones', 'colores', 'detalles_carrito', 'detalles_reserva', 'detalles_venta', 'empleados', 'inventarios', 'lotes_offline', 'movimientos_inventario', 'notificaciones', 'pagos', 'productos', 'productos_colores', 'productos_tallas', 'proveedores', 'recomendaciones_ia', 'recursos_ra', 'reservas', 'sucursales', 'tallas', 'temporadas', 'tokens_push', 'turnos_caja', 'usuarios', 'ventas']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "id_empresa" INTEGER', tabla);
    EXECUTE format('UPDATE %I SET "id_empresa" = %s', tabla, empresa_a);
    IF tabla <> 'usuarios' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN "id_empresa" SET NOT NULL', tabla);
    END IF;
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE',
      tabla, tabla || '_id_empresa_fkey');
    EXECUTE format('CREATE INDEX %I ON %I ("id_empresa")', tabla || '_id_empresa_idx', tabla);
    -- Defensa en profundidad: si la aplicacion no indica la empresa, el INSERT falla
    -- (app.tenant_id nunca se fija en la sesion; el backend envia id_empresa explicito).
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN "id_empresa" SET DEFAULT (current_setting(''app.tenant_id''::text))::integer',
      tabla);
  END LOOP;
END $$;

-- Uniques globales del parcial 1 pasan a ser por empresa.
DROP INDEX "categorias_nombre_key";
DROP INDEX "colores_codigo_hex_key";
DROP INDEX "colores_nombre_key";
DROP INDEX "proveedores_nombre_key";
DROP INDEX "sucursales_ciudad_nombre_key";
DROP INDEX "tallas_nombre_key";
DROP INDEX "temporadas_nombre_key";
DROP INDEX "usuarios_email_key";

CREATE UNIQUE INDEX "categorias_id_empresa_nombre_key" ON "categorias"("id_empresa", "nombre");
CREATE UNIQUE INDEX "colores_id_empresa_nombre_key" ON "colores"("id_empresa", "nombre");
CREATE UNIQUE INDEX "colores_id_empresa_codigo_hex_key" ON "colores"("id_empresa", "codigo_hex");
CREATE INDEX "productos_id_empresa_activo_idx" ON "productos"("id_empresa", "activo");
CREATE UNIQUE INDEX "proveedores_id_empresa_nombre_key" ON "proveedores"("id_empresa", "nombre");
CREATE UNIQUE INDEX "sucursales_id_empresa_ciudad_nombre_key" ON "sucursales"("id_empresa", "ciudad", "nombre");
CREATE UNIQUE INDEX "tallas_id_empresa_nombre_key" ON "tallas"("id_empresa", "nombre");
CREATE UNIQUE INDEX "temporadas_id_empresa_nombre_key" ON "temporadas"("id_empresa", "nombre");
CREATE UNIQUE INDEX "usuarios_id_empresa_email_key" ON "usuarios"("id_empresa", "email");
CREATE INDEX "ventas_id_empresa_fecha_idx" ON "ventas"("id_empresa", "fecha");

-- PLATFORM_ADMIN no tiene empresa: su email igual debe ser unico (NULL no participa del unique compuesto).
CREATE UNIQUE INDEX "usuarios_email_plataforma_key" ON "usuarios"("email") WHERE "id_empresa" IS NULL;
