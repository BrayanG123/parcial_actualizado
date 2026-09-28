# Catálogo para la presentación

Esta etapa incorpora fotos, precios mayoristas y el nombre del almacén de cada sucursal. POS en React, turnos, contra entrega y offline se completan en las etapas siguientes.

## Un almacén por sucursal

Cada sucursal representa una tienda con un único almacén. `Branch.warehouseName` permite nombrarlo; su identificador sigue siendo el de la sucursal. No se duplica el stock ni se introduce una tabla de almacenes con cantidades independientes.

En React: **Administración → Sucursales → Nombre del almacén**. El nombre aparece en Inventario. Las reservas, ventas y movimientos existentes continúan usando `branchId`.

Esta simplificación cubre varias sucursales con un almacén cada una. No permite varios depósitos dentro de la misma sucursal ni traslados entre depósitos.

## Clientes y precios mayoristas

- Solo el administrador puede marcar **Cliente mayorista** en Usuarios. El registro público crea clientes minoristas.
- Cada producto tiene un precio minorista y un `wholesalePrice` opcional, positivo, con hasta dos decimales y no superior al minorista.
- Si el cliente es mayorista y el producto tiene precio mayorista, se utiliza ese precio sin acumular promociones minoristas.
- Si no tiene precio mayorista, se utiliza el precio minorista vigente, incluida su promoción.
- `wholesalePrice: null` elimina el precio especial; omitirlo al editar lo conserva.
- El servidor calcula el precio del carrito, checkout y venta presencial usando la clasificación guardada del cliente. Una venta sin cliente identificado utiliza precio minorista.
- La web muestra la tarifa según la sesión del cliente. Si el administrador cambia la clasificación mientras el cliente está conectado, recargar la página actualiza su perfil. El backend siempre vuelve a consultar la clasificación al calcular la compra.

## Fotos y Cloudinary

Se admiten hasta 8 fotos por producto. El orden de `imageUrls` determina la galería y la primera es la principal. `imageUrl` se mantiene para los contratos anteriores. Enviar `imageUrls: []` quita todas las referencias. La migración conserva la imagen anterior de cada producto.

En React: **Administración → Productos → Nuevo/Editar → Fotos del producto**. Se pueden subir archivos JPG, PNG o WebP de hasta 5 MB, agregar URLs, elegir la principal y quitar fotos. Después hay que guardar el producto.

### Configurar la cuenta

1. Crear la cuenta de Cloudinary y localizar **Cloud name**, **API Key** y **API Secret** en su consola.
2. Completar estas variables en `backend/.env` (ver `.env.example`):

```dotenv
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
```

3. Reiniciar NestJS. React debe usar la API real (`VITE_USE_MOCKS=false`).
4. Iniciar sesión como administrador, subir una foto, guardar el producto y abrir su ficha pública.

No hace falta un upload preset. NestJS firma y envía la imagen a Cloudinary; React recibe únicamente su URL pública e identificador. No poner el API Secret en variables `VITE_*` ni en el repositorio. Referencia: [subidas firmadas de Cloudinary](https://cloudinary.com/documentation/upload_images).

Sin configurar Cloudinary, el resto del catálogo funciona y todavía se pueden agregar fotos mediante URL. La subida muestra un mensaje explicando la configuración pendiente. Las pruebas automatizadas simulan la respuesta de Cloudinary; verificar la cuenta real requiere sus credenciales.

Para mantener sencilla la demostración, quitar una foto del producto no borra el archivo de Cloudinary. Si se cancela el formulario después de subir, ese archivo también permanece en Cloudinary. Se pueden limpiar manualmente esos archivos de prueba desde su consola.

## Migración y comprobación

La migración `20260915000000_catalog_foundation` es aditiva y conserva los datos. Para otro entorno:

```powershell
cd backend
npm run prisma:migrate:deploy
npm run build
```

Comprobar en la presentación: crear producto con dos fotos, cambiar la principal, editarlo sin perder fotos, marcar un cliente como mayorista y comparar su carrito con el de un cliente minorista. Los escenarios HTTP de `test/catalog-foundation.e2e-spec.ts` usan un esquema temporal de PostgreSQL y lo eliminan al finalizar.
