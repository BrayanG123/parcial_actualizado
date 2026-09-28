import { precioActual, stockDisponible, totalLineas } from '../../lib/domain';
import {
  CanalVenta,
  EstadoPago,
  EstadoReserva,
  EstadoVenta,
  MetodoPago,
  TipoMovimiento,
  TipoPago,
  type DetalleVenta,
  type Pago,
  type Reserva,
  type Venta,
} from '../../types/domain';
import { inventario, movimientos, productos, reservas, siguienteId, ventas } from '../db';
import {
  carritoDe,
  expandirCarrito,
  expandirReserva,
  expandirVenta,
  invalido,
  noEncontrado,
  num,
  paginar,
  requiereSesion,
  type CtxMock,
  type RutaMock,
} from '../core';

/* ---------------- helpers ---------------- */

interface LineaEntrada {
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
}

function leerLineas(body: any): LineaEntrada[] {
  const lineas = Array.isArray(body?.detalles) ? body.detalles : [];
  if (lineas.length === 0) invalido('Debes incluir al menos una prenda.');
  return lineas.map((l: any) => ({
    id_producto: Number(l.id_producto),
    id_talla: Number(l.id_talla),
    id_color: Number(l.id_color),
    cantidad: Math.max(1, Number(l.cantidad ?? 1)),
  }));
}

function registroInventario(idSucursal: number, l: LineaEntrada) {
  return inventario.find(
    (i) =>
      i.id_sucursal === idSucursal &&
      i.id_producto === l.id_producto &&
      i.id_talla === l.id_talla &&
      i.id_color === l.id_color,
  );
}

function nombreProducto(id: number): string {
  return productos.find((p) => p.id_producto === id)?.nombre ?? 'la prenda';
}

function registrarMovimiento(
  idInventario: number,
  tipo: (typeof TipoMovimiento)[keyof typeof TipoMovimiento],
  cantidad: number,
  referencia: string,
  idEmpleado: number | null,
) {
  movimientos.push({
    id_movimiento: siguienteId('movimiento'),
    id_inventario: idInventario,
    tipo,
    cantidad,
    estado: 'CONFIRMADO',
    referencia,
    fecha: new Date().toISOString(),
    fecha_programada: null,
    observacion: '',
    id_empleado: idEmpleado,
  });
}

function clienteDe(ctx: CtxMock): number {
  const usuario = requiereSesion(ctx);
  if (!usuario.id_cliente) invalido('Esta operacion solo esta disponible para clientes.');
  return usuario.id_cliente;
}

/* ---------------- carrito ---------------- */

const rutasCarrito: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/carrito$/,
    handler: (ctx) => expandirCarrito(carritoDe(clienteDe(ctx))),
  },
  {
    metodo: 'POST',
    patron: /^\/carrito\/items$/,
    handler: (ctx) => {
      const carrito = carritoDe(clienteDe(ctx));
      const { body } = ctx;
      const id_producto = Number(body?.id_producto);
      const id_talla = Number(body?.id_talla);
      const id_color = Number(body?.id_color);
      const cantidad = Math.max(1, Number(body?.cantidad ?? 1));

      const producto = productos.find((p) => p.id_producto === id_producto);
      if (!producto) noEncontrado('producto');
      if (!id_talla || !id_color) invalido('Selecciona talla y color antes de agregar al carrito.');

      const disponibleTotal = inventario
        .filter((i) => i.id_producto === id_producto && i.id_talla === id_talla && i.id_color === id_color)
        .reduce((acc, i) => acc + stockDisponible(i), 0);
      if (disponibleTotal < cantidad) {
        invalido('No hay stock suficiente de esa combinacion de talla y color.');
      }

      const existente = carrito.detalles.find(
        (d) => d.id_producto === id_producto && d.id_talla === id_talla && d.id_color === id_color,
      );
      if (existente) {
        existente.cantidad = Math.min(disponibleTotal, existente.cantidad + cantidad);
      } else {
        carrito.detalles.push({
          id_detalle_carrito: siguienteId('detalleCarrito'),
          id_carrito: carrito.id_carrito,
          id_producto,
          id_talla,
          id_color,
          cantidad,
          precio_unitario: precioActual(producto),
        });
      }
      return expandirCarrito(carrito);
    },
  },
  {
    metodo: 'PATCH',
    patron: /^\/carrito\/items\/(\d+)$/,
    handler: (ctx) => {
      const carrito = carritoDe(clienteDe(ctx));
      const detalle = carrito.detalles.find((d) => d.id_detalle_carrito === Number(ctx.partes[0]));
      if (!detalle) noEncontrado('item del carrito');
      const cantidad = Number(ctx.body?.cantidad ?? 1);
      if (cantidad <= 0) invalido('La cantidad debe ser mayor a cero.');
      detalle.cantidad = cantidad;
      return expandirCarrito(carrito);
    },
  },
  {
    metodo: 'DELETE',
    patron: /^\/carrito\/items\/(\d+)$/,
    handler: (ctx) => {
      const carrito = carritoDe(clienteDe(ctx));
      const idx = carrito.detalles.findIndex((d) => d.id_detalle_carrito === Number(ctx.partes[0]));
      if (idx === -1) noEncontrado('item del carrito');
      carrito.detalles.splice(idx, 1);
      return expandirCarrito(carrito);
    },
  },
  {
    metodo: 'DELETE',
    patron: /^\/carrito$/,
    handler: (ctx) => {
      const carrito = carritoDe(clienteDe(ctx));
      carrito.detalles = [];
      return expandirCarrito(carrito);
    },
  },
];

/* ---------------- reservas ---------------- */

const TRANSICIONES: Record<string, EstadoReserva[]> = {
  PENDIENTE: [EstadoReserva.PREPARANDO, EstadoReserva.CANCELADA, EstadoReserva.VENCIDA],
  PREPARANDO: [EstadoReserva.LISTA, EstadoReserva.CANCELADA],
  LISTA: [EstadoReserva.CLIENTE_PRESENTE, EstadoReserva.CANCELADA, EstadoReserva.VENCIDA],
  CLIENTE_PRESENTE: [EstadoReserva.ATENDIDA, EstadoReserva.CANCELADA],
  ATENDIDA: [],
  CANCELADA: [],
  VENCIDA: [],
};

function liberarReserva(reserva: Reserva, idEmpleado: number | null) {
  for (const d of reserva.detalles) {
    const inv = registroInventario(reserva.id_sucursal, d);
    if (!inv) continue;
    inv.cantidad_reservada = Math.max(0, inv.cantidad_reservada - d.cantidad);
    registrarMovimiento(
      inv.id_inventario,
      TipoMovimiento.LIBERACION_RESERVA,
      d.cantidad,
      `R-${reserva.id_reserva}`,
      idEmpleado,
    );
  }
}

const rutasReservas: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/reservas$/,
    handler: (ctx) => {
      const usuario = requiereSesion(ctx);
      const { params } = ctx;
      let lista = reservas.map(expandirReserva);

      if (usuario.id_cliente && !usuario.id_empleado) {
        lista = lista.filter((r) => r.id_cliente === usuario.id_cliente);
      }
      const idSucursal = num(params.id_sucursal);
      if (idSucursal) lista = lista.filter((r) => r.id_sucursal === idSucursal);
      if (params.estado) lista = lista.filter((r) => r.estado === params.estado);

      lista.sort((a, b) => b.fecha_reserva.localeCompare(a.fecha_reserva));
      return paginar(lista, { page_size: 20, ...params });
    },
  },
  {
    metodo: 'GET',
    patron: /^\/reservas\/(\d+)$/,
    handler: (ctx) => {
      const r = reservas.find((x) => x.id_reserva === Number(ctx.partes[0]));
      return r ? expandirReserva(r) : noEncontrado('reserva');
    },
  },
  {
    metodo: 'POST',
    patron: /^\/reservas$/,
    handler: (ctx) => {
      const id_cliente = clienteDe(ctx);
      const id_sucursal = Number(ctx.body?.id_sucursal);
      if (!id_sucursal) invalido('Selecciona la sucursal donde probaras las prendas.');
      if (!ctx.body?.horario_aproximado) invalido('Indica un horario aproximado de visita.');

      const lineas = leerLineas(ctx.body);
      for (const l of lineas) {
        const inv = registroInventario(id_sucursal, l);
        if (!inv || stockDisponible(inv) < l.cantidad) {
          invalido(`No hay disponibilidad de ${nombreProducto(l.id_producto)} en esa sucursal.`);
        }
      }

      const id_reserva = siguienteId('reserva');
      const reserva: Reserva = {
        id_reserva,
        id_cliente,
        id_sucursal,
        fecha_reserva: new Date().toISOString(),
        horario_aproximado: String(ctx.body.horario_aproximado),
        estado: EstadoReserva.PENDIENTE,
        observacion: String(ctx.body?.observacion ?? ''),
        detalles: lineas.map((l) => ({
          id_detalle_reserva: siguienteId('detalleReserva'),
          id_reserva,
          id_producto: l.id_producto,
          id_talla: l.id_talla,
          id_color: l.id_color,
          cantidad: l.cantidad,
          estado: 'PENDIENTE',
        })),
      };

      for (const l of lineas) {
        const inv = registroInventario(id_sucursal, l)!;
        inv.cantidad_reservada += l.cantidad;
        registrarMovimiento(inv.id_inventario, TipoMovimiento.RESERVA, l.cantidad, `R-${id_reserva}`, null);
      }

      reservas.unshift(reserva);
      return expandirReserva(reserva);
    },
  },
  {
    metodo: 'PATCH',
    patron: /^\/reservas\/(\d+)\/estado$/,
    handler: (ctx) => {
      const usuario = requiereSesion(ctx);
      const reserva = reservas.find((x) => x.id_reserva === Number(ctx.partes[0]));
      if (!reserva) noEncontrado('reserva');
      const estado = String(ctx.body?.estado ?? '') as EstadoReserva;
      if (!TRANSICIONES[reserva.estado]?.includes(estado)) {
        invalido(`No es posible pasar de ${reserva.estado} a ${estado}.`);
      }
      if (estado === EstadoReserva.CANCELADA || estado === EstadoReserva.VENCIDA) {
        liberarReserva(reserva, usuario.id_empleado ?? null);
      }
      if (estado === EstadoReserva.ATENDIDA) {
        reserva.detalles.forEach((d) => (d.estado = 'ATENDIDA'));
      }
      reserva.estado = estado;
      return expandirReserva(reserva);
    },
  },
  {
    metodo: 'POST',
    patron: /^\/reservas\/(\d+)\/cancelar$/,
    handler: (ctx) => {
      const usuario = requiereSesion(ctx);
      const reserva = reservas.find((x) => x.id_reserva === Number(ctx.partes[0]));
      if (!reserva) noEncontrado('reserva');
      if (!TRANSICIONES[reserva.estado]?.includes(EstadoReserva.CANCELADA)) {
        invalido('Esta reserva ya no se puede cancelar.');
      }
      liberarReserva(reserva, usuario.id_empleado ?? null);
      reserva.estado = EstadoReserva.CANCELADA;
      return expandirReserva(reserva);
    },
  },
];

/* ---------------- ventas y pagos ---------------- */

const rutasVentas: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/ventas$/,
    handler: (ctx) => {
      const usuario = requiereSesion(ctx);
      const { params } = ctx;
      let lista = ventas.map(expandirVenta);

      if (usuario.id_cliente && !usuario.id_empleado) {
        lista = lista.filter((v) => v.id_cliente === usuario.id_cliente);
      }
      const idSucursal = num(params.id_sucursal);
      if (idSucursal) lista = lista.filter((v) => v.id_sucursal === idSucursal);
      if (params.canal) lista = lista.filter((v) => v.canal === params.canal);
      if (params.desde) lista = lista.filter((v) => v.fecha >= String(params.desde));
      if (params.hasta) lista = lista.filter((v) => v.fecha <= `${String(params.hasta)}T23:59:59`);

      lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
      return paginar(lista, { page_size: 20, ...params });
    },
  },
  {
    metodo: 'GET',
    patron: /^\/ventas\/(\d+)$/,
    handler: (ctx) => {
      const v = ventas.find((x) => x.id_venta === Number(ctx.partes[0]));
      return v ? expandirVenta(v) : noEncontrado('venta');
    },
  },
  {
    metodo: 'POST',
    patron: /^\/ventas$/,
    handler: (ctx) => {
      const usuario = requiereSesion(ctx);
      const canal = String(ctx.body?.canal ?? CanalVenta.WEB) as CanalVenta;
      const id_sucursal = num(ctx.body?.id_sucursal) ?? null;
      const lineas = leerLineas(ctx.body);

      if (canal === CanalVenta.PRESENCIAL && !id_sucursal) {
        invalido('La venta presencial requiere una sucursal.');
      }

      // El stock se descuenta de la sucursal indicada; para ventas web se usa
      // la sucursal seleccionada como punto de despacho.
      const sucursalStock = id_sucursal ?? 1;
      for (const l of lineas) {
        const inv = registroInventario(sucursalStock, l);
        if (!inv || stockDisponible(inv) < l.cantidad) {
          invalido(`No hay stock suficiente de ${nombreProducto(l.id_producto)}.`);
        }
      }

      const id_venta = siguienteId('venta');
      const detalles: DetalleVenta[] = lineas.map((l) => {
        const producto = productos.find((p) => p.id_producto === l.id_producto)!;
        const unitario = producto.precio;
        const descuento = Math.round(((unitario * producto.descuento_pct) / 100) * l.cantidad * 100) / 100;
        return {
          id_detalle_venta: siguienteId('detalleVenta'),
          id_venta,
          id_producto: l.id_producto,
          id_talla: l.id_talla,
          id_color: l.id_color,
          cantidad: l.cantidad,
          precio_unitario: unitario,
          descuento,
        };
      });

      const total = totalLineas(detalles);
      const metodo = String(ctx.body?.pago?.metodo ?? MetodoPago.EFECTIVO) as MetodoPago;
      const tipo =
        metodo === MetodoPago.EFECTIVO || metodo === MetodoPago.TARJETA
          ? TipoPago.PRESENCIAL
          : TipoPago.ELECTRONICO;

      const pago: Pago = {
        id_pago: siguienteId('pago'),
        id_venta,
        metodo,
        tipo: canal === CanalVenta.PRESENCIAL ? TipoPago.PRESENCIAL : tipo,
        monto: total,
        estado: EstadoPago.APROBADO,
        referencia_externa: `PAY-${id_venta}`,
        fecha: new Date().toISOString(),
      };

      const venta: Venta = {
        id_venta,
        id_cliente: usuario.id_cliente ?? num(ctx.body?.id_cliente) ?? null,
        id_empleado: usuario.id_empleado ?? null,
        id_sucursal,
        id_reserva: num(ctx.body?.id_reserva) ?? null,
        fecha: new Date().toISOString(),
        canal,
        estado: EstadoVenta.PAGADA,
        total,
        detalles,
        pagos: [pago],
      };

      for (const l of lineas) {
        const inv = registroInventario(sucursalStock, l)!;
        inv.cantidad_fisica = Math.max(0, inv.cantidad_fisica - l.cantidad);
        registrarMovimiento(
          inv.id_inventario,
          TipoMovimiento.VENTA,
          -l.cantidad,
          `V-${id_venta}`,
          usuario.id_empleado ?? null,
        );
      }

      ventas.unshift(venta);

      // Si la venta nace del carrito del cliente, el carrito queda vacio.
      if (usuario.id_cliente && canal !== CanalVenta.PRESENCIAL) {
        carritoDe(usuario.id_cliente).detalles = [];
      }

      return expandirVenta(venta);
    },
  },
  {
    metodo: 'POST',
    patron: /^\/ventas\/(\d+)\/pagos$/,
    handler: (ctx) => {
      const venta = ventas.find((x) => x.id_venta === Number(ctx.partes[0]));
      if (!venta) noEncontrado('venta');
      const monto = Number(ctx.body?.monto ?? 0);
      if (monto <= 0) invalido('El monto del pago debe ser mayor a cero.');
      const pago: Pago = {
        id_pago: siguienteId('pago'),
        id_venta: venta.id_venta,
        metodo: String(ctx.body?.metodo ?? MetodoPago.EFECTIVO) as MetodoPago,
        tipo: String(ctx.body?.tipo ?? TipoPago.PRESENCIAL) as TipoPago,
        monto,
        estado: EstadoPago.APROBADO,
        referencia_externa: String(ctx.body?.referencia_externa ?? `PAY-${venta.id_venta}`),
        fecha: new Date().toISOString(),
      };
      venta.pagos.push(pago);
      return pago;
    },
  },
];

export const rutasComercio: RutaMock[] = [...rutasCarrito, ...rutasReservas, ...rutasVentas];
