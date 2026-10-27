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
  branchId: number,
  payload: Record<string, unknown>,
  resumen: OperacionLocal['resumen'],
): Promise<OperacionLocal> {
  const op: OperacionLocal = {
    operationId: crypto.randomUUID(),
    alcance,
    tipo,
    branchId,
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
  datos: { items: ItemSeleccion[]; recibido: number; clienteId?: number },
) {
  if (!snapshot.openShift) throw new Error('Abre tu turno con conexion y vuelve a descargar los datos.');
  const lineas = validarItems(snapshot, await listarOperaciones(alcance), datos.items);
  const total = totalSeleccion(snapshot, datos.items);
  if (!Number.isFinite(datos.recibido) || datos.recibido < total)
    throw new Error('El efectivo recibido debe cubrir el total.');
  return crear(
    alcance,
    'SALE_CASH',
    snapshot.branchId,
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
  datos: { items: ItemSeleccion[]; horario: string; observacion?: string },
) {
  const horario = new Date(datos.horario);
  if (!Number.isFinite(horario.getTime()) || horario.getTime() <= Date.now())
    throw new Error('Elige una fecha y hora futura para la visita.');
  const lineas = validarItems(snapshot, await listarOperaciones(alcance), datos.items);
  return crear(
    alcance,
    'RESERVATION',
    snapshot.branchId,
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
