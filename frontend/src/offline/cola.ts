/**
 * Cola de operaciones offline: valida contra los datos descargados, genera el
 * operationId (UUID) y guarda la operacion en IndexedDB ANTES de confirmar al usuario.
 */
import { hashPayload } from './hash';
import { guardarOperaciones, listarOperaciones, stockLocal } from './repositorio';
import { claveVariante, type OperacionLocal, type SnapshotOffline, type TipoOperacion } from './tipos';

export interface ItemSeleccion {
  productId: number;
  sizeId: number;
  colorId: number;
  quantity: number;
}

function validarItems(snapshot: SnapshotOffline, ops: OperacionLocal[], items: ItemSeleccion[]) {
  if (!items.length || items.length > 50) throw new Error('Selecciona entre 1 y 50 prendas distintas.');
  if (new Set(items.map(claveVariante)).size !== items.length) throw new Error('Hay prendas repetidas en la seleccion.');
  return items.map((item) => {
    const variante = snapshot.variants.find((v) => claveVariante(v) === claveVariante(item));
    if (!variante) throw new Error('Una prenda no esta en los datos descargados.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)
      throw new Error('Cada cantidad debe estar entre 1 y 100.');
    if (item.quantity > stockLocal(snapshot, ops, item))
      throw new Error(`No hay stock local suficiente de ${variante.productName} (${variante.sizeName} / ${variante.colorName}).`);
    return { item, variante };
  });
}

export function totalSeleccion(snapshot: SnapshotOffline, items: ItemSeleccion[]) {
  const centavos = items.reduce((suma, item) => {
    const v = snapshot.variants.find((x) => claveVariante(x) === claveVariante(item));
    return suma + Math.round((v?.netUnitPrice ?? 0) * 100) * item.quantity;
  }, 0);
  return centavos / 100;
}

let ultimoOrden = 0;
/** Monotono dentro de la pestana y creciente entre sesiones (basado en el reloj). */
function siguienteOrden() {
  ultimoOrden = Math.max(ultimoOrden + 1, Date.now() * 1000);
  return ultimoOrden;
}

async function crear(
  alcance: string,
  tipo: TipoOperacion,
  snapshot: SnapshotOffline,
  usuarioId: number | undefined,
  payload: Record<string, unknown>,
  resumen: OperacionLocal['resumen'],
): Promise<OperacionLocal> {
  const op: OperacionLocal = {
    operationId: crypto.randomUUID(),
    alcance,
    tipo,
    tenantId: snapshot.tenant?.id,
    userId: usuarioId,
    branchId: snapshot.branchId,
    createdAtLocal: new Date().toISOString(),
    orden: siguienteOrden(),
    payload,
    payloadHash: await hashPayload(payload),
    estado: 'LOCAL',
    intentos: 0,
    resumen,
    actualizadaEn: new Date().toISOString(),
  };
  await guardarOperaciones(op);
  return op;
}

/** Venta de contado offline (SALE_CASH): requiere el turno abierto al descargar. */
export async function registrarVenta(
  alcance: string,
  snapshot: SnapshotOffline,
  datos: { items: ItemSeleccion[]; recibido: number; clienteId?: number; usuarioId?: number },
) {
  if (!snapshot.openShift) throw new Error('Abre tu turno con conexion y vuelve a descargar los datos.');
  const lineas = validarItems(snapshot, await listarOperaciones(alcance), datos.items);
  const total = totalSeleccion(snapshot, datos.items);
  if (!Number.isFinite(datos.recibido) || datos.recibido < total)
    throw new Error('El efectivo recibido debe cubrir el total.');
  return crear(
    alcance,
    'SALE_CASH',
    snapshot,
    datos.usuarioId,
    {
      shiftId: snapshot.openShift.id,
      ...(datos.clienteId ? { clientId: datos.clienteId } : {}),
      items: lineas.map(({ item, variante }) => ({ ...item, unitPrice: variante.netUnitPrice })),
      total,
      paymentMethod: 'CASH',
      cashReceived: datos.recibido,
    },
    {
      titulo: `Venta en efectivo · ${snapshot.branch.name}`,
      total,
      moneda: snapshot.currency,
      lineas: lineas.map(({ item, variante }) => ({
        nombre: `${variante.productName} (${variante.sizeName} / ${variante.colorName})`,
        cantidad: item.quantity,
        precio: variante.netUnitPrice,
      })),
    },
  );
}

/** Reserva offline de un cliente (RESERVATION). */
export async function registrarReserva(
  alcance: string,
  snapshot: SnapshotOffline,
  datos: { items: ItemSeleccion[]; horario: string; observacion?: string; usuarioId?: number },
) {
  const horario = new Date(datos.horario);
  if (!Number.isFinite(horario.getTime()) || horario.getTime() <= Date.now())
    throw new Error('Elige una fecha y hora futura para la visita.');
  const lineas = validarItems(snapshot, await listarOperaciones(alcance), datos.items);
  return crear(
    alcance,
    'RESERVATION',
    snapshot,
    datos.usuarioId,
    {
      approximateTime: horario.toISOString(),
      items: datos.items.map(({ productId, sizeId, colorId, quantity }) => ({ productId, sizeId, colorId, quantity })),
      ...(datos.observacion?.trim() ? { observation: datos.observacion.trim() } : {}),
    },
    {
      titulo: `Reserva · ${snapshot.branch.name}`,
      total: totalSeleccion(snapshot, datos.items),
      moneda: snapshot.currency,
      lineas: lineas.map(({ item, variante }) => ({
        nombre: `${variante.productName} (${variante.sizeName} / ${variante.colorName})`,
        cantidad: item.quantity,
        precio: variante.netUnitPrice,
      })),
    },
  );
}

/**
 * Cambio de prenda offline (EXCHANGE): la venta se indica por su numero y la linea por
 * la variante devuelta; el servidor valida plazo, cantidades y calcula la diferencia.
 */
export async function registrarCambio(
  alcance: string,
  snapshot: SnapshotOffline,
  datos: {
    ventaId: number;
    devuelta: { productId: number; sizeId: number; colorId: number };
    nueva: { productId: number; sizeId: number; colorId: number };
    cantidad: number;
    motivo?: string;
    usuarioId?: number;
  },
) {
  if (!Number.isInteger(datos.ventaId) || datos.ventaId < 1) throw new Error('Indica el numero de la venta original.');
  if (!Number.isInteger(datos.cantidad) || datos.cantidad < 1 || datos.cantidad > 100)
    throw new Error('La cantidad debe estar entre 1 y 100.');
  const buscar = (v: { productId: number; sizeId: number; colorId: number }) =>
    snapshot.variants.find((x) => claveVariante(x) === claveVariante(v));
  const devuelta = buscar(datos.devuelta);
  const nueva = buscar(datos.nueva);
  if (!devuelta || !nueva) throw new Error('Elige prendas de los datos descargados.');
  if (datos.cantidad > stockLocal(snapshot, await listarOperaciones(alcance), datos.nueva))
    throw new Error(`No hay stock local suficiente de ${nueva.productName} (${nueva.sizeName} / ${nueva.colorName}).`);
  return crear(
    alcance,
    'EXCHANGE',
    snapshot,
    datos.usuarioId,
    {
      saleId: datos.ventaId,
      returnedProductId: devuelta.productId,
      returnedSizeId: devuelta.sizeId,
      returnedColorId: devuelta.colorId,
      quantity: datos.cantidad,
      newProductId: nueva.productId,
      newSizeId: nueva.sizeId,
      newColorId: nueva.colorId,
      ...(snapshot.openShift ? { shiftId: snapshot.openShift.id } : {}),
      ...(datos.motivo?.trim() ? { reason: datos.motivo.trim() } : {}),
    },
    {
      titulo: `Cambio de prenda · venta #${datos.ventaId}`,
      moneda: snapshot.currency,
      lineas: [
        { nombre: `Devuelve ${devuelta.productName} (${devuelta.sizeName} / ${devuelta.colorName})`, cantidad: datos.cantidad },
        { nombre: `Lleva ${nueva.productName} (${nueva.sizeName} / ${nueva.colorName})`, cantidad: datos.cantidad, precio: nueva.netUnitPrice },
      ],
    },
  );
}
