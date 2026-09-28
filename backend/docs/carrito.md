# Carrito de compras

Un carrito activo por cliente, compartido entre web y móvil. Permite agregar
variantes de producto/talla/color, cambiar cantidades, eliminar prendas y vaciar
la selección. Las rutas requieren JWT y rol `CUSTOMER`.

## Activación

Desde `backend`, antes de iniciar la nueva versión:

```sh
npm run build
npm run prisma:migrate:deploy
npm run start:dev
```

La migración `20260912010000_active_cart_unique` agrega un índice único parcial
que permite un solo carrito `ACTIVE` por cliente. Los carritos `CONVERTED` y
`ABANDONED` permanecen como historial. El índice se define en SQL y está señalado
con un comentario en `schema.prisma`; aplicar migraciones, no sustituirlas con
`db push`. Véase la [documentación de índices parciales de PostgreSQL](https://www.postgresql.org/docs/17/indexes-partial.html).

Si una base anterior tiene varios carritos activos del mismo cliente, la migración
fallará sin fusionarlos ni eliminar artículos. Esos casos deben conciliarse antes
de volver a aplicar la migración.

## Endpoints

Prefijo: `/api/v1`. Cabecera: `Authorization: Bearer <accessToken>`.

| Método | Ruta | Comportamiento |
|---|---|---|
| GET | `/cart` | Devuelve el carrito activo; crea uno vacío si no existe |
| POST | `/cart/items` | Agrega una variante o suma unidades a la línea existente |
| PATCH | `/cart/items/:itemId` | Reemplaza la cantidad de una línea propia |
| DELETE | `/cart/items/:itemId` | Elimina una línea propia |
| DELETE | `/cart/items` | Vacía el carrito manteniéndolo activo |

Agregar:

```json
{ "productId": 1, "sizeId": 1, "colorId": 1, "quantity": 2 }
```

Cambiar cantidad:

```json
{ "quantity": 3 }
```

Cada operación devuelve el carrito completo actualizado, dentro de
`{ "success": true, "data": { ... }, "timestamp": "..." }`.
`POST` responde 201; las demás operaciones responden 200.

El cliente no envía `clientId`, `cartId`, precios, descuentos ni estados. El
propietario se obtiene del usuario autenticado. Un `itemId` ajeno o perteneciente
a un carrito histórico responde 404. Los administradores sin rol cliente no
acceden a estas rutas. Máximo 50 variantes diferentes y 100 unidades por variante,
incluida la cantidad acumulada tras sucesivas adiciones. Cantidad cero es inválida;
para quitar una prenda se usa DELETE.

Errores: 400 para datos inválidos, 401 sin JWT válido, 403 sin perfil/rol de cliente,
404 para producto o línea inexistente y 409 para variante inactiva, falta de stock
o conflictos concurrentes persistentes.

## Precio y disponibilidad

- El backend calcula `unitPrice` y `subtotal` con el precio vigente del catálogo,
  incluido su descuento promocional. Catálogo y carrito comparten la misma función
  de precios y redondeo decimal a dos posiciones.
- `storedUnitPrice` es el precio guardado al agregar o modificar esa línea.
  `priceChanged` indica si difiere del precio actual. Consultar el carrito no
  sobrescribe ese valor; el total siempre usa el precio vigente.
- `total` suma todos los subtotales, incluso prendas actualmente no disponibles.
  Es un importe informativo, no una venta ni una autorización de cobro.
- `itemCount` cuenta variantes; `totalQuantity` cuenta unidades.
- Cada línea incluye producto, talla, color, `available`, `availability` por sucursal
  activa y `issue` (`PRODUCT_INACTIVE`, `VARIANT_UNAVAILABLE`, `INSUFFICIENT_STOCK` o null).
- Para agregar o modificar una variante, al menos una sucursal activa debe tener
  suficientes unidades: `physicalQuantity - reservedQuantity`. No se suma stock de
  varias sucursales para satisfacer una sola línea.
- `availableBranches` contiene las sucursales capaces de atender **todo** el carrito.
  `hasAvailability` es verdadero cuando existe al menos una. Puede ser falso aunque
  cada artículo tenga stock por separado, si se encuentran en distintas sucursales.
- Si después baja el stock, se elimina una variante del catálogo o se desactiva un
  producto, la selección permanece visible y puede eliminarse o vaciarse.

**El carrito no reserva ni descuenta inventario, ni registra movimientos.** Dos
clientes pueden tener la misma última unidad en sus carritos. El módulo de
[Ventas y checkout](./ventas-checkout.md) cotiza el carrito, valida stock en una
sucursal y lo aparta mientras se espera el pago. El cobro por Stripe queda para Pagos.

Los cambios utilizan transacciones serializables, una escritura en el carrito
padre y reintentos acotados para evitar carritos/líneas duplicados o incrementos
perdidos con peticiones simultáneas. POST es aditivo: repetir intencionalmente la
petición agrega más unidades. PATCH expresa la cantidad final deseada.

## Contrato y datos de demostración

[Contrato OpenAPI](./cart.openapi.json), importable en Swagger Editor o herramientas
compatibles. El servidor no incorpora una interfaz Swagger nueva.

Después del seed base, configurar `SEED_CUSTOMER_EMAIL` y `SEED_CUSTOMER_PASSWORD`:

```sh
npm run prisma:seed:cart
```

Crea el cliente de demostración si no existe y agrega una unidad disponible usando
el servicio real. Si el carrito ya contiene prendas, lo deja intacto. No cambia
credenciales de cuentas existentes ni cantidades de inventario. Si el cliente
vacía su carrito, ejecutar de nuevo el seed vuelve a agregar una prenda.

## Pruebas

```sh
npm test -- --no-file-parallelism
npm run lint
npm run build
```

Para pruebas HTTP y concurrencia con PostgreSQL real, desde PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/base_de_pruebas'
npm run test:e2e -- --no-file-parallelism
```

Se usan esquemas temporales `cart_test_*`, con migraciones, datos y JWT reales.
Se eliminan únicamente esos esquemas al finalizar. Sin `TEST_DATABASE_URL`, las
pruebas que requieren PostgreSQL se omiten. Se comprueban propiedad, roles,
validaciones, operaciones del carrito, concurrencia, índice único, conservación
del historial, precios actuales y disponibilidad por sucursal.
