# Examen 1 – S2-2026 – Sistemas II

---

# PLATAFORMA INTELIGENTE DE COMERCIO ELECTRÓNICO PARA TIENDA DE ROPA CON VESTIDORES VIRTUALES VÍA REALIDAD AUMENTADA

## 1. Enunciado

Una reconocida cadena de tiendas de ropa desea desarrollar una Plataforma Inteligente de Comercio Electrónico, que permita gestionar de manera integrada sus diferentes sucursales ubicadas en varias ciudades y ofrecer a sus clientes una experiencia de compra presencial y digital.

La plataforma deberá disponer de aplicaciones web y móvil, permitiendo a los clientes consultar el catálogo de prendas de vestir, visualizar disponibilidad por sucursal, seleccionar diferentes tallas y colores, reservar varias prendas y acudir posteriormente a una sucursal para probarlas en los vestidores físicos.

Como elemento innovador, la plataforma deberá incorporar vestidores virtuales mediante realidad aumentada, permitiendo al cliente visualizar de manera virtual cómo podría lucir una determinada prenda utilizando la cámara de su dispositivo móvil. Esta funcionalidad deberá integrarse con el catálogo de productos y las características disponibles de cada prenda.

El cliente podrá realizar una reserva de varias prendas, indicando la sucursal donde desea probarlas y un horario aproximado de atención. La sucursal deberá recibir la reserva y preparar las prendas seleccionadas. Una vez que el cliente se encuentre en la tienda, podrá probarse las prendas y decidir cuáles desea comprar.

La compra podrá realizarse de dos formas principales:

- **Compra presencial:** el cliente selecciona las prendas después de probarlas y realiza el pago en el punto de caja de la sucursal.
- **Compra digital:** el cliente puede realizar la compra desde la aplicación móvil o plataforma web mediante una pasarela de pago electrónica.

En ambos casos, el sistema deberá actualizar automáticamente el inventario correspondiente, considerando producto, talla, color, sucursal y temporada.

La empresa trabaja con diferentes proveedores de ropa, quienes proporcionan productos correspondientes a distintas temporadas comerciales, por ejemplo:

- Primavera-verano.
- Otoño-invierno.
- Temporada escolar.
- Promociones especiales.
- Nuevas colecciones.

Por este motivo, la plataforma deberá permitir administrar proveedores, productos, temporadas, colecciones y movimientos de inventario.

El sistema deberá proporcionar información consolidada de las existencias de todas las sucursales, permitiendo conocer qué prendas están disponibles, reservadas, vendidas, agotadas o próximas a ingresar.

Además, se deberá incorporar inteligencia artificial para proporcionar funcionalidades inteligentes que apoyen tanto al cliente como a la administración de la empresa. Entre ellas se podrá implementar un asistente virtual/recomendador de prendas, capaz de sugerir productos considerando:

- Preferencias del cliente.
- Historial de navegación o compra.
- Temporada.
- Categoría.
- Talla.
- Disponibilidad.

La solución deberá desarrollarse utilizando:

- **Backend:** Nestjs.
- **Frontend web:** React.
- **Aplicación móvil:** React Native.
- **Base de datos:** PostgreSQL Sistema gestor de base de datos relacional.
- **Inteligencia artificial:** modelo o servicio de IA integrado mediante API.
- **Realidad aumentada:** tecnología compatible con dispositivos móviles.
- **Pagos:** integración con una pasarela de pago (Stripe).
- **Metodología:** Proceso Unificado de Desarrollo de Software (PUDS).
- **Modelado:** UML 2.5+.

El proyecto tendrá una duración máxima de **4 semanas**
---

## 2. Objetivo general

Desarrollar una plataforma inteligente de comercio electrónico para una cadena de tiendas de ropa, que integre comercio electrónico web y móvil, reservas de prendas, gestión de sucursales, inventario, puntos de venta, pagos electrónicos, vestidores virtuales mediante realidad aumentada e inteligencia artificial, utilizando el Proceso Unificado de Desarrollo y modelos UML.

---

## 3. Objetivos específicos

1. Analizar y especificar los requisitos funcionales y no funcionales del sistema.
2. Gestionar clientes, usuarios, empleados, proveedores y sucursales.
3. Administrar el catálogo de prendas, categorías, tallas, colores, temporadas y colecciones.
4. Consultar la disponibilidad de prendas por sucursal.
5. Permitir al cliente reservar varias prendas para probarlas posteriormente en una tienda.
6. Gestionar el proceso de recepción y atención de reservas.
7. Incorporar vestidores virtuales utilizando realidad aumentada.
8. Permitir compras mediante la plataforma web y aplicación móvil.
9. Permitir pagos presenciales en puntos de caja.
10. Integrar una pasarela de pago para compras digitales.
11. Actualizar automáticamente el inventario después de reservas, ventas, devoluciones y recepción de productos.
12. Gestionar productos provenientes de diferentes proveedores y temporadas.
13. Incorporar funcionalidades de inteligencia artificial para recomendación o asistencia al cliente.
14. Generar reportes y dashboards para apoyar la toma de decisiones.
15. Aplicar UML 2.5+ para modelar los procesos, funcionalidades y arquitectura del sistema.
16. Implementar el sistema utilizando Nestjs, React y React native.

---

## 4. Actores principales

### Cliente

- Registrarse e iniciar sesión.
- Consultar catálogo.
- Buscar y filtrar prendas.
- Consultar tallas y colores.
- Consultar disponibilidad por sucursal.
- Utilizar el vestidor virtual.
- Reservar varias prendas.
- Consultar y cancelar reservas.
- Comprar desde web o móvil.
- Realizar pagos electrónicos.
- Consultar historial de compras.
- Recibir recomendaciones mediante IA.

### Administrador

- Gestionar usuarios y roles.
- Gestionar sucursales.
- Gestionar productos.
- Gestionar categorías, tallas y colores.
- Gestionar temporadas y colecciones.
- Gestionar proveedores.
- Consultar inventario global.
- Gestionar promociones.
- Consultar ventas y reservas.
- Visualizar indicadores empresariales.

### Encargado de sucursal

- Consultar reservas.
- Preparar prendas reservadas.
- Confirmar recepción del cliente.
- Gestionar disponibilidad de prendas.
- Registrar movimientos de inventario.
- Consultar ventas de la sucursal.

### Cajero

- Consultar productos.
- Registrar ventas presenciales.
- Procesar pagos en caja.
- Emitir comprobantes.
- Actualizar inventario después de una venta.

### Proveedor

- Registrar o enviar información de productos.
- Informar disponibilidad de productos.
- Asociar productos con temporadas y colecciones.

### Sistema de pagos

- Procesar pagos electrónicos.
- Confirmar o rechazar transacciones.
- Informar el estado del pago.

### Servicio de inteligencia artificial

- Analizar preferencias.
- Recomendar productos.
- Asistir al cliente mediante chatbot o asistente inteligente.
- Generar reportes generativo bajo demanda, vía comando de voz.

---

## 5. Requisitos funcionales principales

- **RF01.** El sistema deberá permitir registrar clientes.
- **RF02.** El sistema deberá permitir gestionar usuarios y roles.
- **RF03.** El sistema deberá administrar múltiples ciudades y sucursales.
- **RF04.** El sistema deberá permitir gestionar productos de ropa.
- **RF05.** El sistema deberá gestionar tallas, colores, categorías y temporadas.
- **RF06.** El sistema deberá gestionar proveedores.
- **RF07.** El cliente deberá poder consultar el catálogo desde web y móvil.
- **RF08.** El cliente deberá poder consultar disponibilidad por sucursal.
- **RF09.** El cliente deberá poder seleccionar múltiples prendas para una reserva.
- **RF10.** El sistema deberá registrar y gestionar reservas.
- **RF11.** El sistema deberá notificar las reservas a la sucursal correspondiente.
- **RF12.** El sistema deberá permitir consultar el estado de una reserva.
- **RF13.** La aplicación móvil deberá permitir utilizar el vestidor virtual.
- **RF14.** El cliente deberá poder agregar productos al carrito.
- **RF15.** El cliente deberá poder comprar mediante la plataforma web.
- **RF16.** El cliente deberá poder comprar mediante la aplicación móvil.
- **RF17.** El cajero deberá poder registrar ventas presenciales.
- **RF18.** El sistema deberá permitir pagos en punto de caja.
- **RF19.** El sistema deberá integrar una pasarela de pago para compras digitales.
- **RF20.** El sistema deberá actualizar automáticamente el inventario después de una venta.
- **RF21.** El sistema deberá controlar las existencias por sucursal.
- **RF22.** El sistema deberá registrar movimientos de inventario.
- **RF23.** El sistema deberá gestionar temporadas y colecciones.
- **RF24.** El sistema deberá permitir consultar reportes de ventas e inventario.
- **RF25.** El sistema deberá proporcionar al menos una funcionalidad basada en inteligencia artificial.

---

## 6. Requisitos no funcionales

- **RNF01. Seguridad:** las contraseñas y datos sensibles deberán protegerse adecuadamente.
- **RNF02. Rendimiento:** las consultas del catálogo deberán responder en tiempos adecuados.
- **RNF03. Disponibilidad:** el sistema deberá estar disponible para usuarios web y móviles.
- **RNF04. Escalabilidad:** la arquitectura deberá permitir incorporar nuevas sucursales y ciudades.
- **RNF05. Usabilidad:** las interfaces deberán ser intuitivas y adaptables a diferentes dispositivos.
- **RNF06. Mantenibilidad:** el código deberá organizarse en módulos y seguir buenas prácticas.
- **RNF07. Integración:** Nestjs deberá proporcionar servicios mediante API REST.
- **RNF08. Compatibilidad:** la aplicación móvil deberá desarrollarse utilizando React Native.
- **RNF09. Seguridad transaccional:** las operaciones de pago deberán utilizar mecanismos seguros y, para el proyecto académico, entornos de prueba.

---

## TOMAR EN CUENTA

No esta permitidos usar framework de tipo e-commerce como ser:

- PrestaShop.
- Shopify.
- Magento.
- WooCommerce.
- Y similares.

**Despliegue:** En la nube (Azure).
