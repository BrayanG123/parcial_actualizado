# Notificaciones de reservas

El backend guarda un aviso cuando un cliente crea una reserva (RF11). La web del
personal puede mostrar una campana con contador y una lista mediante esta API REST.
Los avisos persisten aunque nadie esté conectado o el servidor se reinicie.

## Activar en tu equipo

Desde `backend`, con `DATABASE_URL` apuntando a tu base `tienda_ropa`:

```powershell
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

La migración `20260914000000_reservation_notifications` añade `notificaciones` y
`lecturas_notificacion`, dos entidades técnicas adicionales al diagrama MVP original.
También genera avisos para reservas anteriores en estados `PENDING`, `PREPARING`,
`READY` o `CUSTOMER_PRESENT`, conservando su fecha original. No genera avisos
históricos para reservas cerradas. No cambia el stock ni los estados de reservas.

No requiere nuevas variables de entorno ni un servicio externo de mensajería.
La fecha límite de las reservas sigue siendo el final del día de la cita en Bolivia.

## Permisos y funcionamiento

| Usuario | Alcance |
|---|---|
| `ADMINISTRATOR` | Todas las sucursales; filtro opcional `branchId` |
| `BRANCH_MANAGER` | Solo la sucursal de su perfil de empleado activo |
| Cliente, cajero o proveedor | Sin acceso a estas notificaciones |

Los permisos coinciden con la gestión de Reservas. La API consulta la asignación
actual del encargado en cada petición. Los avisos pertenecen a la sucursal y no
requieren que haya un encargado asignado cuando se crea la reserva.

- Reserva, aviso y retención de inventario se confirman en la misma transacción.
  Si falla una operación, se revierten todas.
- Existe como máximo un aviso de creación por reserva. El mensaje resume la
  cantidad de unidades; `approximateTime` indica cuándo llegará el cliente.
- La lectura es individual. Abrir un aviso como encargado no lo marca leído
  para otro encargado ni para el administrador.
- Consultar la lista o el contador **no** marca avisos como leídos.
- Repetir el marcado conserva la primera fecha de lectura, incluso con peticiones
  simultáneas. El usuario se obtiene del JWT; no se envía `userId`.
- Los cambios de estado y el vencimiento conservan el aviso y su lectura.
  `reservationStatus` muestra el estado actual; cantidad, cita y fecha de creación
  son los datos guardados al crear el aviso.

## Rutas

Prefijo: `/api/v1`. Todas requieren `Authorization: Bearer TOKEN` y responden con
`Cache-Control: no-store`. Contrato importable en Swagger Editor o Postman:
[notifications.openapi.json](./notifications.openapi.json).

| Método y ruta | Uso |
|---|---|
| `GET /notifications` | Lista paginada y contador de pendientes |
| `GET /notifications/unread-count` | Contador del usuario autenticado |
| `PATCH /notifications/:id/read` | Marcar un aviso como leído; sin cuerpo |

Filtros de la lista: `page` (1 por defecto, máximo 1000000), `limit` (20 por
defecto, máximo 100), `unreadOnly=true|false` (false por defecto) y `branchId`.
El contador solo admite `branchId`. Un encargado puede omitirlo o enviar su propia
sucursal; otra sucursal produce 403. Se rechazan parámetros desconocidos.

Ejemplo `GET /notifications?unreadOnly=true&limit=20`:

```json
{
  "success": true,
  "data": {
    "data": [{
      "id": 12,
      "branchId": 2,
      "reservationId": 35,
      "type": "RESERVATION_CREATED",
      "title": "Nueva reserva #35",
      "message": "3 prendas reservadas",
      "unitCount": 3,
      "approximateTime": "2026-09-13T19:00:00.000Z",
      "createdAt": "2026-09-12T17:00:00.000Z",
      "branch": { "id": 2, "name": "Central", "city": "La Paz" },
      "reservationStatus": "PENDING",
      "isRead": false,
      "readAt": null
    }],
    "unreadCount": 1,
    "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2026-09-12T17:01:00.000Z"
}
```

La lista va de más reciente a más antigua, usando el ID para desempatar.
`meta.total` cuenta los avisos que cumplen el filtro; `unreadCount` cuenta todos
los pendientes del usuario en el alcance de sucursal, independientemente de la página.

El contador responde con `data: { "unreadCount": 1 }`. El marcado responde con
`data: { "id": 12, "isRead": true, "readAt": "2026-09-12T17:02:00.000Z" }`.
Ambos usan el mismo envoltorio `success`, `data`, `timestamp`.

Errores: 400 para parámetros inválidos, 401 sin sesión válida, 403 por rol o
asignación de sucursal, 404 al marcar un aviso inexistente o de otra sucursal.

## Conectar la campana en la web

1. Tras iniciar sesión como administrador o encargado, consultar el contador.
2. Actualizarlo periódicamente, por ejemplo cada 30 segundos, y al recuperar el
   foco de la ventana. Evitar solicitudes superpuestas y detenerlas al cerrar sesión.
3. Al desplegar la campana, consultar la lista. Mostrar sucursal, mensaje, estado
   y cita; convertir las fechas para mostrarlas en `America/La_Paz`.
4. Cuando el usuario abra un aviso, enviar el `PATCH` y navegar al detalle de
   la reserva usando `reservationId`. Refrescar lista y contador tras el marcado.
5. Ante 401 detener las consultas y solicitar inicio de sesión; ante 403 actualizar
   los permisos visibles de la interfaz.

La interfaz de la campana queda a cargo del frontend. Esta entrega usa consultas
HTTP periódicas: no incluye WebSocket, SSE, push con la aplicación cerrada, correo
ni avisos al cliente cuando su reserva esté lista.

## Datos de demostración y pruebas

```powershell
npm run prisma:seed:demo
```

El seed incluye siete avisos, uno por reserva DEMO, incluidos sus estados cerrados
para mostrar el historial. El administrador ve siete y los encargados ven los de
su sucursal. Repetirlo añade solo avisos DEMO faltantes y conserva las lecturas;
`notificationsAdded` indica cuántos se agregaron. Las cuentas y contraseñas se
explican en [Instalación y seed](./instalacion-y-seed.md).

```powershell
npm test
$env:TEST_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/base_de_pruebas'
npm run test:e2e -- --no-file-parallelism
```

Las pruebas E2E usan esquemas temporales y cubren aislamiento por sucursal,
lecturas por usuario, concurrencia, rollback junto al inventario, paginación,
actualización desde datos anteriores y repetición del seed. Sin `TEST_DATABASE_URL`
se omiten explícitamente las pruebas PostgreSQL.

## Notificaciones push de compras (Firebase Cloud Messaging)

Cuando un **cliente** compra por la web o la app, el personal recibe un aviso en su navegador, aunque la pestaña esté cerrada:

- **Quién lo recibe:** administradores (todas las sucursales) y encargados y cajeros de la sucursal de la venta.
- **Cuándo:** al confirmarse un pago con Stripe (`confirmElectronicPayment`) o al crearse un pedido contra entrega (`checkout`). Los reintentos idempotentes no repiten el aviso. Las ventas de caja no avisan, porque las hace el propio personal.
- **Texto:** por ejemplo, "Nueva compra pagada (web) — Ana Rojas compró 3 prendas: Camisa Oxford x2 y Jean Slim. Bs 349.90 - Sucursal Centro". Al hacer clic se abre la lista de ventas del rol.
- El envío ocurre **fuera de la transacción** y nunca lanza errores: si Firebase falla, la venta no se ve afectada.

Endpoints (personal: `ADMINISTRATOR`, `BRANCH_MANAGER`, `CASHIER`):

| Método | Ruta | Uso |
|---|---|---|
| GET | `/push/status` | `{ enabled }`: si el backend tiene credenciales de Firebase |
| POST | `/push/tokens` | `{ token, platform }`: registra este navegador (si se repite, se actualiza) |
| DELETE | `/push/tokens` | `{ token }`: se llama al cerrar sesión |

Los tokens se guardan en `tokens_push` (migración `20260920000000_push_tokens`). FCM informa los dispositivos que ya no existen y se borran solos.

### Configuración

**Backend** (`backend/.env` o secretos de Azure). Salen del JSON de *Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada*:

```
FIREBASE_PROJECT_ID=shoping-a72ce
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@shoping-a72ce.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Frontend** (`frontend/.env`, o `--build-arg` en Docker): la configuración de la app web `VITE_FIREBASE_*` (pública) y `VITE_FIREBASE_VAPID_KEY`, de *Cloud Messaging > Certificados push web*.

**En el navegador:** el personal pulsa **"Activar avisos"** en la barra superior del panel. El navegador pide permiso una sola vez. Requiere HTTPS o `localhost`.
