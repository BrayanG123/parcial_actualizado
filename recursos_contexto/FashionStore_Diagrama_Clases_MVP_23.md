# FashionStore — Diagrama de clases UML (MVP)

> Modelo simplificado de **23 clases**, pensado para el MVP académico de FashionStore.  
> Formato: **Mermaid Class Diagram**, portable a Mermaid Live Editor, Mermaid Chart, VS Code, Obsidian, GitHub y herramientas compatibles.

```mermaid
classDiagram
direction LR

%% =========================================================
%% 1. USUARIOS Y ORGANIZACIÓN
%% =========================================================

class Usuario {
  +int id_usuario
  +string nombre
  +string email
  +string password_hash
  +bool activo
  +datetime fecha_registro
  +iniciarSesion()
  +cerrarSesion()
}

class Cliente {
  +int id_cliente
  +string telefono
  +string direccion
  +consultarHistorial()
}

class Empleado {
  +int id_empleado
  +string cargo
  +bool activo
}

class Rol {
  +int id_rol
  +string nombre
  +string descripcion
}

class Sucursal {
  +int id_sucursal
  +string nombre
  +string ciudad
  +string direccion
  +string telefono
  +bool activa
}

Usuario <|-- Cliente
Usuario <|-- Empleado
Usuario "*" -- "*" Rol : posee
Sucursal "1" -- "0..*" Empleado : asigna

%% =========================================================
%% 2. CATÁLOGO
%% =========================================================

class Categoria {
  +int id_categoria
  +string nombre
  +string descripcion
}

class Temporada {
  +int id_temporada
  +string nombre
  +date fecha_inicio
  +date fecha_fin
  +bool activa
}

class Coleccion {
  +int id_coleccion
  +string nombre
  +string descripcion
  +bool activa
}

class Proveedor {
  +int id_proveedor
  +string nombre
  +string contacto
  +string telefono
  +string email
  +bool activo
}

class Talla {
  +int id_talla
  +string nombre
}

class Color {
  +int id_color
  +string nombre
  +string codigo_hex
}

class Producto {
  +int id_producto
  +string nombre
  +string descripcion
  +decimal precio
  +string imagen_url
  +decimal descuento_pct
  +date promo_inicio
  +date promo_fin
  +bool activo
  +obtenerPrecioActual()
}

Categoria "1" -- "0..*" Producto : clasifica
Temporada "1" -- "0..*" Producto : corresponde
Coleccion "1" -- "0..*" Producto : agrupa
Proveedor "1" -- "0..*" Producto : suministra
Producto "*" -- "*" Talla : disponible_en
Producto "*" -- "*" Color : disponible_en
Temporada "1" -- "0..*" Coleccion : contiene

%% =========================================================
%% 3. INVENTARIO
%% =========================================================

class Inventario {
  +int id_inventario
  +int cantidad_fisica
  +int cantidad_reservada
  +int stockDisponible()
  +bool hayDisponibilidad()
}

class MovimientoInventario {
  +int id_movimiento
  +string tipo
  +int cantidad
  +string estado
  +string referencia
  +datetime fecha
  +datetime fecha_programada
  +string observacion
}

Sucursal "1" -- "0..*" Inventario : posee
Producto "1" -- "0..*" Inventario : controla
Talla "1" -- "0..*" Inventario : especifica
Color "1" -- "0..*" Inventario : especifica
Inventario "1" -- "0..*" MovimientoInventario : registra
Empleado "0..1" -- "0..*" MovimientoInventario : realiza

%% =========================================================
%% 4. RESERVAS PARA PRUEBA EN SUCURSAL
%% =========================================================

class Reserva {
  +int id_reserva
  +datetime fecha_reserva
  +datetime horario_aproximado
  +string estado
  +string observacion
  +confirmar()
  +cancelar()
}

class DetalleReserva {
  +int id_detalle_reserva
  +int cantidad
  +string estado
}

Cliente "1" -- "0..*" Reserva : realiza
Sucursal "1" -- "0..*" Reserva : recibe
Reserva "1" *-- "1..*" DetalleReserva : contiene
Producto "1" -- "0..*" DetalleReserva : prenda
Talla "1" -- "0..*" DetalleReserva : talla
Color "1" -- "0..*" DetalleReserva : color

%% =========================================================
%% 5. CARRITO
%% =========================================================

class Carrito {
  +int id_carrito
  +datetime fecha_creacion
  +string estado
  +decimal calcularTotal()
  +vaciar()
}

class DetalleCarrito {
  +int id_detalle_carrito
  +int cantidad
  +decimal precio_unitario
  +decimal subtotal()
}

Cliente "1" -- "0..*" Carrito : posee
Carrito "1" *-- "0..*" DetalleCarrito : contiene
Producto "1" -- "0..*" DetalleCarrito : producto
Talla "1" -- "0..*" DetalleCarrito : talla
Color "1" -- "0..*" DetalleCarrito : color

%% =========================================================
%% 6. VENTAS Y PAGOS
%% =========================================================

class Venta {
  +int id_venta
  +datetime fecha
  +string canal
  +string estado
  +decimal total
  +confirmarVenta()
  +calcularTotal()
}

class DetalleVenta {
  +int id_detalle_venta
  +int cantidad
  +decimal precio_unitario
  +decimal descuento
  +decimal subtotal()
}

class Pago {
  +int id_pago
  +string metodo
  +string tipo
  +decimal monto
  +string estado
  +string referencia_externa
  +datetime fecha
  +procesar()
  +confirmar()
}

Cliente "0..1" -- "0..*" Venta : compra
Empleado "0..1" -- "0..*" Venta : registra
Sucursal "0..1" -- "0..*" Venta : descuenta_stock
Venta "1" *-- "1..*" DetalleVenta : contiene
Producto "1" -- "0..*" DetalleVenta : producto
Talla "1" -- "0..*" DetalleVenta : talla
Color "1" -- "0..*" DetalleVenta : color
Venta "1" -- "1..*" Pago : posee

Reserva "0..1" --> "0..1" Venta : puede_generar

%% =========================================================
%% 7. REALIDAD AUMENTADA E INTELIGENCIA ARTIFICIAL
%% =========================================================

class RecursoRA {
  +int id_recurso_ra
  +string tipo
  +string url_recurso
  +string formato
  +bool activo
}

class RecomendacionIA {
  +int id_recomendacion
  +datetime fecha
  +string motivo
  +decimal puntuacion
  +string origen
}

Producto "1" -- "0..*" RecursoRA : usa_en_vestidor
Cliente "1" -- "0..*" RecomendacionIA : recibe
Producto "1" -- "0..*" RecomendacionIA : recomienda

%% =========================================================
%% RELACIONES DE APOYO AL PROCESO
%% =========================================================

DetalleReserva ..> Inventario : verifica_y_reserva
DetalleCarrito ..> Inventario : consulta_disponibilidad
DetalleVenta ..> Inventario : descuenta
Venta ..> MovimientoInventario : genera
Reserva ..> MovimientoInventario : genera
Pago ..> Venta : confirma
RecomendacionIA ..> Inventario : considera_disponibilidad
```

---

## Clases incluidas

| # | Clase | Responsabilidad principal |
|---:|---|---|
| 1 | `Usuario` | Credenciales y acceso al sistema |
| 2 | `Cliente` | Datos y acciones del comprador |
| 3 | `Empleado` | Personal de la empresa |
| 4 | `Rol` | Administrador, encargado, cajero, etc. |
| 5 | `Sucursal` | Tiendas físicas por ciudad |
| 6 | `Categoria` | Clasificación de prendas |
| 7 | `Temporada` | Primavera-verano, otoño-invierno, escolar, etc. |
| 8 | `Coleccion` | Agrupación comercial de productos |
| 9 | `Proveedor` | Proveedor de prendas |
| 10 | `Talla` | Tallas disponibles |
| 11 | `Color` | Colores disponibles |
| 12 | `Producto` | Prenda del catálogo y promoción simplificada |
| 13 | `Inventario` | Existencias por producto, talla, color y sucursal |
| 14 | `MovimientoInventario` | Entradas, salidas, reservas, devoluciones y ajustes |
| 15 | `Reserva` | Reserva de prendas para prueba en tienda |
| 16 | `DetalleReserva` | Prendas incluidas en una reserva |
| 17 | `Carrito` | Carrito de compra del cliente |
| 18 | `DetalleCarrito` | Productos del carrito |
| 19 | `Venta` | Compra presencial, web o móvil |
| 20 | `DetalleVenta` | Productos vendidos |
| 21 | `Pago` | Pago en caja o por pasarela electrónica |
| 22 | `RecursoRA` | Recurso usado por el vestidor virtual |
| 23 | `RecomendacionIA` | Resultado de recomendación inteligente |

---

## Decisiones de simplificación para el MVP

### 1. Promociones
No se crea una clase `Promocion`. Para el MVP, `Producto` contiene:

- `descuento_pct`
- `promo_inicio`
- `promo_fin`

Esto permite demostrar la gestión de promociones sin agregar otra entidad.

### 2. Variantes de producto
No se crea una clase `VarianteProducto`. La combinación concreta se controla mediante:

**Producto + Talla + Color + Sucursal → Inventario**

Así se puede consultar, por ejemplo:

> Camisa Oxford / talla M / color azul / Sucursal Centro / 5 unidades disponibles.

### 3. Devoluciones y recepción de productos
No se crean clases independientes. Se registran mediante `MovimientoInventario`.

Valores sugeridos para `tipo`:

- `ENTRADA`
- `VENTA`
- `RESERVA`
- `LIBERACION_RESERVA`
- `DEVOLUCION`
- `AJUSTE`
- `INGRESO_PENDIENTE`

### 4. Tipos de venta
Se utiliza una sola clase `Venta`.

Valores sugeridos para `canal`:

- `PRESENCIAL`
- `WEB`
- `MOVIL`

### 5. Pagos
Se utiliza una sola clase `Pago`.

Valores sugeridos para `metodo`:

- `EFECTIVO`
- `TARJETA`
- `QR`
- `TRANSFERENCIA`
- `PASARELA`

Valores sugeridos para `tipo`:

- `PRESENCIAL`
- `ELECTRONICO`

### 6. Estados de reserva
Valores sugeridos:

- `PENDIENTE`
- `PREPARANDO`
- `LISTA`
- `CLIENTE_PRESENTE`
- `ATENDIDA`
- `CANCELADA`
- `VENCIDA`

### 7. Estados de pago
Valores sugeridos:

- `PENDIENTE`
- `APROBADO`
- `RECHAZADO`
- `ANULADO`

### 8. Inteligencia artificial
`RecomendacionIA` almacena el resultado de una recomendación.  
La lógica de IA se implementará como un **servicio externo/API**, por lo que no es necesario modelar internamente modelos, datasets o entrenamiento.

### 9. Vestidor virtual
`RecursoRA` representa el recurso que React Native utilizará para mostrar una prenda mediante realidad aumentada. La implementación concreta del motor RA no necesita convertirse en una entidad del dominio.

### 10. Reportes y dashboards
No se crean clases `Reporte` o `Dashboard`. Los indicadores se obtienen consultando:

- `Venta`
- `Inventario`
- `Reserva`
- `Producto`
- `Sucursal`

---

## Restricción principal de inventario

En la base de datos, la combinación siguiente debería ser única:

```text
(id_sucursal, id_producto, id_talla, id_color)
```

De esta manera no pueden existir dos registros distintos de inventario para exactamente la misma prenda, talla, color y sucursal.

La disponibilidad puede calcularse como:

```text
stock_disponible = cantidad_fisica - cantidad_reservada
```

---

## Cobertura funcional del modelo

| Funcionalidad solicitada | Clases principales |
|---|---|
| Registro y acceso | `Usuario`, `Cliente` |
| Usuarios y roles | `Usuario`, `Empleado`, `Rol` |
| Ciudades y sucursales | `Sucursal` |
| Catálogo | `Producto`, `Categoria`, `Talla`, `Color` |
| Temporadas y colecciones | `Temporada`, `Coleccion` |
| Proveedores | `Proveedor`, `Producto` |
| Disponibilidad por sucursal | `Inventario`, `Sucursal` |
| Reservar varias prendas | `Reserva`, `DetalleReserva` |
| Preparación y atención de reserva | `Reserva`, `Empleado`, `Sucursal` |
| Vestidor virtual | `Producto`, `RecursoRA` |
| Carrito | `Carrito`, `DetalleCarrito` |
| Venta web | `Venta` con canal `WEB` |
| Venta móvil | `Venta` con canal `MOVIL` |
| Venta presencial | `Venta` con canal `PRESENCIAL` |
| Pago presencial | `Pago` |
| Pasarela electrónica | `Pago` |
| Actualización de inventario | `Inventario`, `MovimientoInventario` |
| Devoluciones | `MovimientoInventario` |
| Recepción de mercadería | `MovimientoInventario` |
| Promociones | atributos de `Producto` |
| Recomendaciones con IA | `RecomendacionIA` |
| Reportes / dashboard | consultas sobre ventas, inventario y reservas |

---

## Nota para la implementación

Este diagrama representa el **modelo de dominio del MVP**. No significa que cada servicio tecnológico deba convertirse en una tabla.

Elementos como:

- NestJS
- React
- React Native
- PostgreSQL
- pasarela de pago
- servicio de IA
- motor de realidad aumentada

pertenecen principalmente a la **arquitectura e implementación** y se modelarán posteriormente mediante componentes, servicios, APIs y despliegue.
