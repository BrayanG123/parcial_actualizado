import { stockDisponible } from '../../lib/domain';
import { TipoMovimiento, type MovimientoInventario } from '../../types/domain';
import { inventario, movimientos, productos, sucursales, siguienteId } from '../db';
import {
  expandirInventario,
  expandirMovimiento,
  invalido,
  noEncontrado,
  num,
  paginar,
  texto,
  type RutaMock,
} from '../core';

/** Signo con el que cada tipo de movimiento afecta al stock fisico. */
const AFECTA_FISICO: Record<string, number> = {
  [TipoMovimiento.ENTRADA]: 1,
  [TipoMovimiento.DEVOLUCION]: 1,
  [TipoMovimiento.VENTA]: -1,
  [TipoMovimiento.AJUSTE]: 1,
  [TipoMovimiento.RESERVA]: 0,
  [TipoMovimiento.LIBERACION_RESERVA]: 0,
  [TipoMovimiento.INGRESO_PENDIENTE]: 0,
};

export const rutasInventario: RutaMock[] = [
  {
    metodo: 'POST',
    patron: /^\/inventario\/entradas$/,
    handler: ({ body, usuario }) => {
      const product = productos.find((p) => p.id_producto === Number(body.id_producto) && p.activo);
      if (
        !product ||
        !product.tallas.some((t) => t.id_talla === Number(body.id_talla)) ||
        !product.colores.some((c) => c.id_color === Number(body.id_color))
      )
        invalido('Variante invalida.');
      if (!sucursales.some((s) => s.id_sucursal === Number(body.id_sucursal) && s.activa))
        invalido('Sucursal inactiva o inexistente.');
      let inv = inventario.find(
        (i) =>
          i.id_sucursal === Number(body.id_sucursal) &&
          i.id_producto === Number(body.id_producto) &&
          i.id_talla === Number(body.id_talla) &&
          i.id_color === Number(body.id_color),
      );
      if (!inv) {
        inv = {
          id_inventario: siguienteId('inventario'),
          id_sucursal: Number(body.id_sucursal),
          id_producto: Number(body.id_producto),
          id_talla: Number(body.id_talla),
          id_color: Number(body.id_color),
          cantidad_fisica: 0,
          cantidad_reservada: 0,
        };
        inventario.push(inv);
      }
      const pendiente = Boolean(body.pendiente);
      if (!pendiente) inv.cantidad_fisica += Number(body.cantidad);
      const movimiento: MovimientoInventario = {
        id_movimiento: siguienteId('movimiento'),
        id_inventario: inv.id_inventario,
        tipo: pendiente ? TipoMovimiento.INGRESO_PENDIENTE : TipoMovimiento.ENTRADA,
        cantidad: Number(body.cantidad),
        estado: pendiente ? 'PENDIENTE' : 'COMPLETADO',
        fecha: new Date().toISOString(),
        fecha_programada: pendiente ? body.fecha_programada : null,
        referencia: body.referencia ?? '',
        observacion: body.observacion ?? '',
        id_empleado: usuario?.id_empleado ?? null,
      };
      movimientos.push(movimiento);
      return expandirMovimiento(movimiento);
    },
  },
  {
    metodo: 'POST',
    patron: /^\/inventario\/movimientos\/(\d+)\/completar$/,
    handler: ({ partes }) => {
      const m = movimientos.find((v) => v.id_movimiento === Number(partes[0]));
      if (!m) noEncontrado('movimiento');
      if (m.estado !== 'PENDIENTE' || m.tipo !== TipoMovimiento.INGRESO_PENDIENTE)
        invalido('La entrada ya no esta pendiente.');
      const inv = inventario.find((i) => i.id_inventario === m.id_inventario);
      if (!inv) noEncontrado('inventario');
      inv.cantidad_fisica += m.cantidad;
      m.estado = 'COMPLETADO';
      m.fecha = new Date().toISOString();
      return expandirMovimiento(m);
    },
  },
  {
    metodo: 'GET',
    patron: /^\/inventario$/,
    handler: ({ params }) => {
      const idSucursal = num(params.id_sucursal);
      const idProducto = num(params.id_producto);
      const q = texto(params.q);
      const soloCriticos = params.solo_criticos === true || params.solo_criticos === 'true';
      const umbral = num(params.umbral) ?? 3;

      let lista = inventario.map(expandirInventario);
      if (idSucursal) lista = lista.filter((i) => i.id_sucursal === idSucursal);
      if (idProducto) lista = lista.filter((i) => i.id_producto === idProducto);
      if (q) lista = lista.filter((i) => (i.producto?.nombre.toLowerCase() ?? '').includes(q));
      if (soloCriticos) lista = lista.filter((i) => stockDisponible(i) <= umbral);

      // Al filtrar por criticos interesa lo mas urgente primero; en el listado
      // general es mas util el orden natural del catalogo.
      if (soloCriticos) lista.sort((a, b) => stockDisponible(a) - stockDisponible(b));
      else {
        lista.sort(
          (a, b) =>
            (a.producto?.nombre ?? '').localeCompare(b.producto?.nombre ?? '') ||
            a.id_talla - b.id_talla ||
            a.id_color - b.id_color ||
            a.id_sucursal - b.id_sucursal,
        );
      }
      return paginar(lista, { page_size: 20, ...params });
    },
  },
  {
    metodo: 'GET',
    patron: /^\/inventario\/disponibilidad$/,
    handler: ({ params }) => {
      const idProducto = num(params.id_producto);
      if (!idProducto) invalido('Debes indicar el producto para consultar disponibilidad.');
      const idTalla = num(params.id_talla);
      const idColor = num(params.id_color);
      const idSucursal = num(params.id_sucursal);

      return inventario
        .filter(
          (i) =>
            i.id_producto === idProducto &&
            (!idTalla || i.id_talla === idTalla) &&
            (!idColor || i.id_color === idColor) &&
            (!idSucursal || i.id_sucursal === idSucursal),
        )
        .map(expandirInventario);
    },
  },
  {
    metodo: 'GET',
    patron: /^\/inventario\/movimientos$/,
    handler: ({ params }) => {
      const idSucursal = num(params.id_sucursal);
      const tipo = params.tipo ? String(params.tipo) : undefined;
      let lista = movimientos.map(expandirMovimiento);
      if (idSucursal) lista = lista.filter((m) => m.inventario?.id_sucursal === idSucursal);
      if (tipo) lista = lista.filter((m) => m.tipo === tipo);
      if (params.id_inventario)
        lista = lista.filter((m) => m.id_inventario === Number(params.id_inventario));
      if (params.estado)
        lista = lista.filter(
          (m) =>
            m.estado === params.estado ||
            (params.estado === 'COMPLETADO' && m.estado === 'CONFIRMADO'),
        );
      lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
      return paginar(lista, { page_size: 20, ...params });
    },
  },
  {
    metodo: 'POST',
    patron: /^\/inventario\/movimientos$/,
    handler: ({ body, usuario }) => {
      const idInventario = Number(body?.id_inventario ?? 0);
      const cantidad = Number(body?.cantidad ?? 0);
      const tipo = String(body?.tipo ?? '') as MovimientoInventario['tipo'];

      if (!Number.isInteger(cantidad) || cantidad < (tipo === TipoMovimiento.AJUSTE ? 0 : 1))
        invalido('La cantidad no es valida.');
      if (!(tipo in AFECTA_FISICO)) invalido('El tipo de movimiento no es valido.');

      const inv = inventario.find((i) => i.id_inventario === idInventario);
      if (!inv) noEncontrado('registro de inventario');

      if (
        tipo === TipoMovimiento.AJUSTE &&
        (cantidad < inv.cantidad_reservada || cantidad === inv.cantidad_fisica)
      )
        invalido('El stock final debe cambiar y no ser menor al reservado.');
      const signo = AFECTA_FISICO[tipo];
      const delta = tipo === TipoMovimiento.AJUSTE ? Number(body?.cantidad) : signo * cantidad;

      if (tipo === TipoMovimiento.VENTA && stockDisponible(inv) < cantidad) {
        invalido('No hay stock disponible suficiente para registrar la salida.');
      }
      if (tipo === TipoMovimiento.AJUSTE) inv.cantidad_fisica = Math.max(0, cantidad);
      else inv.cantidad_fisica = Math.max(0, inv.cantidad_fisica + delta);

      if (tipo === TipoMovimiento.RESERVA) inv.cantidad_reservada += cantidad;
      if (tipo === TipoMovimiento.LIBERACION_RESERVA) {
        inv.cantidad_reservada = Math.max(0, inv.cantidad_reservada - cantidad);
      }

      const movimiento: MovimientoInventario = {
        id_movimiento: siguienteId('movimiento'),
        id_inventario: idInventario,
        tipo,
        cantidad: tipo === TipoMovimiento.AJUSTE ? cantidad : signo * cantidad || cantidad,
        estado: tipo === TipoMovimiento.INGRESO_PENDIENTE ? 'PENDIENTE' : 'CONFIRMADO',
        referencia: String(body?.referencia ?? ''),
        fecha: new Date().toISOString(),
        fecha_programada: body?.fecha_programada ?? null,
        observacion: String(body?.observacion ?? ''),
        id_empleado: usuario?.id_empleado ?? null,
      };
      movimientos.push(movimiento);
      return expandirMovimiento(movimiento);
    },
  },
  {
    metodo: 'GET',
    patron: /^\/inventario\/(\d+)$/,
    handler: ({ partes }) => {
      const inv = inventario.find((i) => i.id_inventario === Number(partes[0]));
      return inv ? expandirInventario(inv) : noEncontrado('registro de inventario');
    },
  },
  {
    metodo: 'POST',
    patron: /^\/inventario$/,
    handler: ({ body }) => {
      const id_sucursal = Number(body?.id_sucursal);
      const id_producto = Number(body?.id_producto);
      const id_talla = Number(body?.id_talla);
      const id_color = Number(body?.id_color);
      if (!productos.some((p) => p.id_producto === id_producto)) noEncontrado('producto');

      const existente = inventario.find(
        (i) =>
          i.id_sucursal === id_sucursal &&
          i.id_producto === id_producto &&
          i.id_talla === id_talla &&
          i.id_color === id_color,
      );
      if (existente) invalido('Ya existe un registro de inventario para esa combinacion.');

      const nuevo = {
        id_inventario: siguienteId('inventario'),
        id_sucursal,
        id_producto,
        id_talla,
        id_color,
        cantidad_fisica: Number(body?.cantidad_fisica ?? 0),
        cantidad_reservada: 0,
      };
      inventario.push(nuevo);
      return expandirInventario(nuevo);
    },
  },
];
