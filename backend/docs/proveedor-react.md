# Portal de proveedor conectado a React

## Modalidad elegida para el MVP

Se usa la edicion directa de informacion de **productos propios**, una de las modalidades aceptadas para la presentacion. No hay un circuito de propuestas/aprobaciones.

Administracion crea los productos, les asigna proveedor y decide precios, variantes, fotos y publicacion. El proveedor puede enviar/actualizar nombre, descripcion, disponibilidad para suministrar y asociacion con temporada y coleccion. La disponibilidad es un texto breve (por ejemplo, cantidades por talla/color y fecha de suministro); **no incrementa ni reemplaza el stock de la tienda**. El administrador la consulta al editar el producto.

El catalogo publico permanece accesible como para cualquier visitante. Las fichas del portal y las entregas se filtran por la cuenta autenticada en NestJS, sin confiar en un `supplierId` enviado por React. Las notas de disponibilidad no se exponen en el catalogo publico.

## Preparar la demostracion

1. Reiniciar backend y frontend con los cambios actuales. La migracion `20260919000000_supplier_portal` ya esta aplicada en PostgreSQL local. En otro entorno ejecutar `npm run prisma:migrate:deploy` y `npm run build` dentro de backend.
2. Como administrador, crear/activar el proveedor en **Proveedores**.
3. En **Usuarios → Nuevo usuario**, elegir rol **PROVEEDOR** y el **Proveedor asociado**. Para una cuenta existente, asignar primero el rol desde **Roles**, luego editarla y elegir el proveedor. La opcion **Sin proveedor asociado** retira la vinculacion.
4. Crear o editar productos en administracion y asignarlos a ese proveedor. Para este MVP, los nuevos productos se dan de alta desde administracion.
5. Iniciar sesion como proveedor: en **Mis productos**, editar una ficha, informar disponibilidad y cambiar temporada/coleccion. Las colecciones se filtran por temporada; se requieren ambas al cambiar la asociacion. Puede actualizar la descripcion conservando una temporada antigua sin reactivarla.
6. Volver a administracion y editar el producto para mostrar la informacion recibida. Programar una entrada de esas prendas en **Inventario**. El proveedor vera esa entrada en **Entregas programadas**; la recepcion se confirma desde la tienda. Luego el proveedor vera el estado **Recibida**.
7. Desvincular la cuenta, desactivar el proveedor o quitar el rol y verificar que no puede seguir operando, incluso con el JWT anterior. Si solo se cambia la asociacion mientras React sigue abierto, volver a iniciar sesion para actualizar el nombre del proveedor en la interfaz; el backend ya usa el vinculo nuevo.

Una cuenta se asocia con un proveedor; varias cuentas pueden representar al mismo proveedor. Revocar el rol conserva el vinculo administrativo pero bloquea el portal. Al transferir un producto a otro proveedor, se borra su nota de suministro anterior.

## Contratos

- `POST /users` y `PATCH /users/:id`, solo administrador: campo opcional `supplierId`. En edicion, `null` desvincula y omitirlo conserva la asociacion. Una nueva vinculacion requiere rol SUPPLIER y proveedor activo.
- Login, perfil y usuarios incluyen `supplier: {id, name, active} | null`.
- `GET /supplier/products?page=1&limit=20&search=...`: fichas propias activas e inactivas, paginadas.
- `PATCH /supplier/products/:id`: `name`, `description`, `supplierAvailability`; opcionalmente `seasonId` y `collectionId` juntos. Rechaza campos de precios, stock, publicacion, proveedor y variantes.
- `GET /supplier/deliveries?page=1&limit=20`: entradas programadas de productos propios, con variante, sucursal, cantidad, referencia, fechas y estado. No incluye notas internas, empleados ni existencias totales.
- `GET /supplier/products/:id/supply`: solo administrador; disponibilidad informada para el formulario de producto.

Los productos ajenos no se pueden editar desde el portal. La propiedad se comprueba tambien al escribir; la transaccion es serializable para detectar cambios concurrentes. El stock solo cambia mediante los flujos existentes de Inventario/POS/checkout.

## Verificacion

Pruebas HTTP sobre PostgreSQL aislado: login con asociacion, productos propios/inactivos, manipulacion de identificadores, campos prohibidos, acceso sin autenticar, temporadas/colecciones, cuenta desvinculada/inactiva, proveedor inactivo, reasignacion, revocacion de rol y entregas con recepcion exclusiva de la tienda.

Pruebas React: cuenta sin proveedor, edicion de campos autorizados, colecciones por temporada, invalidacion de fichas y notas, consulta de entregas sin endpoints internos, seleccion administrativa y envio explicito de `supplierId`/`null`.
