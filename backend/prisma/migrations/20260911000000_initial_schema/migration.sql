-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMINISTRATOR', 'BRANCH_MANAGER', 'CASHIER', 'CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ENTRY', 'SALE', 'RESERVATION', 'RESERVATION_RELEASE', 'RETURN', 'ADJUSTMENT', 'PENDING_ENTRY');

-- CreateEnum
CREATE TYPE "InventoryMovementStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'CUSTOMER_PRESENT', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationItemStatus" AS ENUM ('PENDING', 'PREPARED', 'PURCHASED', 'RETURNED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('IN_STORE', 'WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'QR', 'BANK_TRANSFER', 'GATEWAY');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('IN_STORE', 'ELECTRONIC');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'VOIDED');

-- CreateTable
CREATE TABLE "usuarios" (
    "id_usuario" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id_cliente" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "telefono" VARCHAR(30),
    "direccion" VARCHAR(250),

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id_cliente")
);

-- CreateTable
CREATE TABLE "empleados" (
    "id_empleado" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_sucursal" INTEGER NOT NULL,
    "cargo" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id_empleado")
);

-- CreateTable
CREATE TABLE "roles" (
    "id_rol" SERIAL NOT NULL,
    "nombre" "RoleName" NOT NULL,
    "descripcion" VARCHAR(250),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "usuarios_roles" (
    "id_usuario" INTEGER NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "fecha_asignacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_roles_pkey" PRIMARY KEY ("id_usuario","id_rol")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id_sucursal" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "ciudad" VARCHAR(100) NOT NULL,
    "direccion" VARCHAR(250) NOT NULL,
    "telefono" VARCHAR(30),
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id_sucursal")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id_categoria" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(250),

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id_categoria")
);

-- CreateTable
CREATE TABLE "temporadas" (
    "id_temporada" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "temporadas_pkey" PRIMARY KEY ("id_temporada")
);

-- CreateTable
CREATE TABLE "colecciones" (
    "id_coleccion" SERIAL NOT NULL,
    "id_temporada" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(250),
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "colecciones_pkey" PRIMARY KEY ("id_coleccion")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id_proveedor" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "contacto" VARCHAR(120),
    "telefono" VARCHAR(30),
    "email" VARCHAR(180),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id_proveedor")
);

-- CreateTable
CREATE TABLE "tallas" (
    "id_talla" SERIAL NOT NULL,
    "nombre" VARCHAR(30) NOT NULL,

    CONSTRAINT "tallas_pkey" PRIMARY KEY ("id_talla")
);

-- CreateTable
CREATE TABLE "colores" (
    "id_color" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "codigo_hex" VARCHAR(7) NOT NULL,

    CONSTRAINT "colores_pkey" PRIMARY KEY ("id_color")
);

-- CreateTable
CREATE TABLE "productos" (
    "id_producto" SERIAL NOT NULL,
    "id_categoria" INTEGER NOT NULL,
    "id_temporada" INTEGER NOT NULL,
    "id_coleccion" INTEGER NOT NULL,
    "id_proveedor" INTEGER NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "imagen_url" TEXT,
    "descuento_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "promo_inicio" DATE,
    "promo_fin" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id_producto")
);

-- CreateTable
CREATE TABLE "productos_tallas" (
    "id_producto" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,

    CONSTRAINT "productos_tallas_pkey" PRIMARY KEY ("id_producto","id_talla")
);

-- CreateTable
CREATE TABLE "productos_colores" (
    "id_producto" INTEGER NOT NULL,
    "id_color" INTEGER NOT NULL,

    CONSTRAINT "productos_colores_pkey" PRIMARY KEY ("id_producto","id_color")
);

-- CreateTable
CREATE TABLE "inventarios" (
    "id_inventario" SERIAL NOT NULL,
    "id_sucursal" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,
    "id_color" INTEGER NOT NULL,
    "cantidad_fisica" INTEGER NOT NULL DEFAULT 0,
    "cantidad_reservada" INTEGER NOT NULL DEFAULT 0,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id_inventario")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id_movimiento" SERIAL NOT NULL,
    "id_inventario" INTEGER NOT NULL,
    "id_empleado" INTEGER,
    "tipo" "InventoryMovementType" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "estado" "InventoryMovementStatus" NOT NULL DEFAULT 'COMPLETED',
    "referencia" VARCHAR(150),
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_programada" TIMESTAMPTZ(3),
    "observacion" VARCHAR(500),

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id_movimiento")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id_reserva" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_sucursal" INTEGER NOT NULL,
    "fecha_reserva" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horario_aproximado" TIMESTAMPTZ(3) NOT NULL,
    "estado" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "observacion" VARCHAR(500),
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id_reserva")
);

-- CreateTable
CREATE TABLE "detalles_reserva" (
    "id_detalle_reserva" SERIAL NOT NULL,
    "id_reserva" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,
    "id_color" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "estado" "ReservationItemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "detalles_reserva_pkey" PRIMARY KEY ("id_detalle_reserva")
);

-- CreateTable
CREATE TABLE "carritos" (
    "id_carrito" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,
    "estado" "CartStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "carritos_pkey" PRIMARY KEY ("id_carrito")
);

-- CreateTable
CREATE TABLE "detalles_carrito" (
    "id_detalle_carrito" SERIAL NOT NULL,
    "id_carrito" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,
    "id_color" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_carrito_pkey" PRIMARY KEY ("id_detalle_carrito")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id_venta" SERIAL NOT NULL,
    "id_cliente" INTEGER,
    "id_empleado" INTEGER,
    "id_sucursal" INTEGER,
    "id_reserva" INTEGER,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" "SaleChannel" NOT NULL,
    "estado" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(12,2) NOT NULL,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id_venta")
);

-- CreateTable
CREATE TABLE "detalles_venta" (
    "id_detalle_venta" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,
    "id_color" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "detalles_venta_pkey" PRIMARY KEY ("id_detalle_venta")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id_pago" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "metodo" "PaymentMethod" NOT NULL,
    "tipo" "PaymentType" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "estado" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "referencia_externa" VARCHAR(200),
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id_pago")
);

-- CreateTable
CREATE TABLE "recursos_ra" (
    "id_recurso_ra" SERIAL NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "url_recurso" TEXT NOT NULL,
    "formato" VARCHAR(30) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "recursos_ra_pkey" PRIMARY KEY ("id_recurso_ra")
);

-- CreateTable
CREATE TABLE "recomendaciones_ia" (
    "id_recomendacion" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" VARCHAR(500),
    "puntuacion" DECIMAL(5,4) NOT NULL,
    "origen" VARCHAR(100) NOT NULL,

    CONSTRAINT "recomendaciones_ia_pkey" PRIMARY KEY ("id_recomendacion")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_id_usuario_key" ON "clientes"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_id_usuario_key" ON "empleados"("id_usuario");

-- CreateIndex
CREATE INDEX "empleados_id_sucursal_idx" ON "empleados"("id_sucursal");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE INDEX "usuarios_roles_id_rol_idx" ON "usuarios_roles"("id_rol");

-- CreateIndex
CREATE INDEX "sucursales_ciudad_activa_idx" ON "sucursales"("ciudad", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_ciudad_nombre_key" ON "sucursales"("ciudad", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "temporadas_nombre_key" ON "temporadas"("nombre");

-- CreateIndex
CREATE INDEX "temporadas_activa_fecha_inicio_fecha_fin_idx" ON "temporadas"("activa", "fecha_inicio", "fecha_fin");

-- CreateIndex
CREATE INDEX "colecciones_activa_idx" ON "colecciones"("activa");

-- CreateIndex
CREATE UNIQUE INDEX "colecciones_id_temporada_nombre_key" ON "colecciones"("id_temporada", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_nombre_key" ON "proveedores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tallas_nombre_key" ON "tallas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "colores_nombre_key" ON "colores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "colores_codigo_hex_key" ON "colores"("codigo_hex");

-- CreateIndex
CREATE INDEX "productos_id_categoria_activo_idx" ON "productos"("id_categoria", "activo");

-- CreateIndex
CREATE INDEX "productos_id_temporada_id_coleccion_idx" ON "productos"("id_temporada", "id_coleccion");

-- CreateIndex
CREATE INDEX "productos_id_proveedor_idx" ON "productos"("id_proveedor");

-- CreateIndex
CREATE INDEX "productos_nombre_idx" ON "productos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_id_proveedor_nombre_key" ON "productos"("id_proveedor", "nombre");

-- CreateIndex
CREATE INDEX "productos_tallas_id_talla_idx" ON "productos_tallas"("id_talla");

-- CreateIndex
CREATE INDEX "productos_colores_id_color_idx" ON "productos_colores"("id_color");

-- CreateIndex
CREATE INDEX "inventarios_id_producto_id_talla_id_color_idx" ON "inventarios"("id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_id_sucursal_id_producto_id_talla_id_color_key" ON "inventarios"("id_sucursal", "id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE INDEX "movimientos_inventario_id_inventario_fecha_idx" ON "movimientos_inventario"("id_inventario", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_inventario_id_empleado_idx" ON "movimientos_inventario"("id_empleado");

-- CreateIndex
CREATE INDEX "movimientos_inventario_tipo_estado_idx" ON "movimientos_inventario"("tipo", "estado");

-- CreateIndex
CREATE INDEX "reservas_id_cliente_estado_idx" ON "reservas"("id_cliente", "estado");

-- CreateIndex
CREATE INDEX "reservas_id_sucursal_horario_aproximado_estado_idx" ON "reservas"("id_sucursal", "horario_aproximado", "estado");

-- CreateIndex
CREATE INDEX "detalles_reserva_id_producto_id_talla_id_color_idx" ON "detalles_reserva"("id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_reserva_id_reserva_id_producto_id_talla_id_color_key" ON "detalles_reserva"("id_reserva", "id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE INDEX "carritos_id_cliente_estado_idx" ON "carritos"("id_cliente", "estado");

-- CreateIndex
CREATE INDEX "detalles_carrito_id_producto_id_talla_id_color_idx" ON "detalles_carrito"("id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_carrito_id_carrito_id_producto_id_talla_id_color_key" ON "detalles_carrito"("id_carrito", "id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_id_reserva_key" ON "ventas"("id_reserva");

-- CreateIndex
CREATE INDEX "ventas_id_cliente_fecha_idx" ON "ventas"("id_cliente", "fecha");

-- CreateIndex
CREATE INDEX "ventas_id_empleado_idx" ON "ventas"("id_empleado");

-- CreateIndex
CREATE INDEX "ventas_id_sucursal_fecha_idx" ON "ventas"("id_sucursal", "fecha");

-- CreateIndex
CREATE INDEX "ventas_canal_estado_idx" ON "ventas"("canal", "estado");

-- CreateIndex
CREATE INDEX "detalles_venta_id_venta_idx" ON "detalles_venta"("id_venta");

-- CreateIndex
CREATE INDEX "detalles_venta_id_producto_id_talla_id_color_idx" ON "detalles_venta"("id_producto", "id_talla", "id_color");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_referencia_externa_key" ON "pagos"("referencia_externa");

-- CreateIndex
CREATE INDEX "pagos_id_venta_estado_idx" ON "pagos"("id_venta", "estado");

-- CreateIndex
CREATE INDEX "recursos_ra_id_producto_activo_idx" ON "recursos_ra"("id_producto", "activo");

-- CreateIndex
CREATE INDEX "recomendaciones_ia_id_cliente_fecha_idx" ON "recomendaciones_ia"("id_cliente", "fecha");

-- CreateIndex
CREATE INDEX "recomendaciones_ia_id_producto_idx" ON "recomendaciones_ia"("id_producto");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id_rol") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecciones" ADD CONSTRAINT "colecciones_id_temporada_fkey" FOREIGN KEY ("id_temporada") REFERENCES "temporadas"("id_temporada") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_id_categoria_fkey" FOREIGN KEY ("id_categoria") REFERENCES "categorias"("id_categoria") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_id_temporada_fkey" FOREIGN KEY ("id_temporada") REFERENCES "temporadas"("id_temporada") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_id_coleccion_fkey" FOREIGN KEY ("id_coleccion") REFERENCES "colecciones"("id_coleccion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_id_proveedor_fkey" FOREIGN KEY ("id_proveedor") REFERENCES "proveedores"("id_proveedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_tallas" ADD CONSTRAINT "productos_tallas_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_tallas" ADD CONSTRAINT "productos_tallas_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_colores" ADD CONSTRAINT "productos_colores_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_colores" ADD CONSTRAINT "productos_colores_id_color_fkey" FOREIGN KEY ("id_color") REFERENCES "colores"("id_color") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_id_color_fkey" FOREIGN KEY ("id_color") REFERENCES "colores"("id_color") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_id_inventario_fkey" FOREIGN KEY ("id_inventario") REFERENCES "inventarios"("id_inventario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_id_empleado_fkey" FOREIGN KEY ("id_empleado") REFERENCES "empleados"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_reserva" ADD CONSTRAINT "detalles_reserva_id_reserva_fkey" FOREIGN KEY ("id_reserva") REFERENCES "reservas"("id_reserva") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_reserva" ADD CONSTRAINT "detalles_reserva_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_reserva" ADD CONSTRAINT "detalles_reserva_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_reserva" ADD CONSTRAINT "detalles_reserva_id_color_fkey" FOREIGN KEY ("id_color") REFERENCES "colores"("id_color") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carritos" ADD CONSTRAINT "carritos_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_carrito" ADD CONSTRAINT "detalles_carrito_id_carrito_fkey" FOREIGN KEY ("id_carrito") REFERENCES "carritos"("id_carrito") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_carrito" ADD CONSTRAINT "detalles_carrito_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_carrito" ADD CONSTRAINT "detalles_carrito_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_carrito" ADD CONSTRAINT "detalles_carrito_id_color_fkey" FOREIGN KEY ("id_color") REFERENCES "colores"("id_color") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_empleado_fkey" FOREIGN KEY ("id_empleado") REFERENCES "empleados"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "sucursales"("id_sucursal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_reserva_fkey" FOREIGN KEY ("id_reserva") REFERENCES "reservas"("id_reserva") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_id_color_fkey" FOREIGN KEY ("id_color") REFERENCES "colores"("id_color") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recursos_ra" ADD CONSTRAINT "recursos_ra_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recomendaciones_ia" ADD CONSTRAINT "recomendaciones_ia_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recomendaciones_ia" ADD CONSTRAINT "recomendaciones_ia_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants that cannot be represented directly in Prisma Schema Language
ALTER TABLE "temporadas" ADD CONSTRAINT "temporadas_fechas_validas_check" CHECK ("fecha_fin" >= "fecha_inicio");
ALTER TABLE "productos" ADD CONSTRAINT "productos_precio_check" CHECK ("precio" >= 0);
ALTER TABLE "productos" ADD CONSTRAINT "productos_descuento_check" CHECK ("descuento_pct" >= 0 AND "descuento_pct" <= 100);
ALTER TABLE "productos" ADD CONSTRAINT "productos_promocion_fechas_check" CHECK ("promo_fin" IS NULL OR "promo_inicio" IS NULL OR "promo_fin" >= "promo_inicio");
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_cantidades_check" CHECK ("cantidad_fisica" >= 0 AND "cantidad_reservada" >= 0 AND "cantidad_reservada" <= "cantidad_fisica");
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_cantidad_check" CHECK ("cantidad" > 0);
ALTER TABLE "detalles_reserva" ADD CONSTRAINT "detalles_reserva_cantidad_check" CHECK ("cantidad" > 0);
ALTER TABLE "detalles_carrito" ADD CONSTRAINT "detalles_carrito_valores_check" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0);
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_total_check" CHECK ("total" >= 0);
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_valores_check" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0 AND "descuento" >= 0);
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto_check" CHECK ("monto" > 0);
ALTER TABLE "recomendaciones_ia" ADD CONSTRAINT "recomendaciones_ia_puntuacion_check" CHECK ("puntuacion" >= 0 AND "puntuacion" <= 1);
