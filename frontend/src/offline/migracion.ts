/**
 * F5.1: migra la caja offline del parcial 1 (localStorage `fs.offline.v1`) a
 * IndexedDB. Los tickets conservan su identificador (operationId = idempotencyKey) y
 * el lote original, asi el servidor los confirma con los precios de esa descarga.
 * La copia antigua no se borra: se renombra como respaldo.
 */
import { BASE_URL } from '../api/config';
import type { CajaOffline } from '../lib/offline';
import { hashPayload } from './hash';
import { guardarOperaciones, obtenerOperacion } from './repositorio';
import { claveVariante, type OperacionLocal } from './tipos';

const claveLegado = (userId: number) => `fs.offline.v1:${BASE_URL}:${userId}`;

export async function migrarLegado(userId: number, alcance: string): Promise<number> {
  let crudo: string | null = null;
  try {
    crudo = localStorage.getItem(claveLegado(userId));
  } catch {
    return 0;
  }
  if (!crudo) return 0;
  const caja = JSON.parse(crudo) as CajaOffline;
  if (caja.version !== 1 || !Array.isArray(caja.tickets)) return 0;
  const { lote } = caja;
  const ops: OperacionLocal[] = [];
  for (const ticket of caja.tickets) {
    const operationId = ticket.datos.idempotencyKey;
    if (await obtenerOperacion(operationId)) continue;
    const lineas = ticket.datos.items.map((item) => ({
      item,
      variante: lote.snapshot.variants.find((v) => claveVariante(v) === claveVariante(item)),
    }));
    const payload = {
      shiftId: lote.shiftId,
      offlineBatchId: lote.id,
      items: lineas.map(({ item, variante }) => ({
        productId: item.productId,
        sizeId: item.sizeId,
        colorId: item.colorId,
        quantity: item.quantity,
        unitPrice: variante?.netUnitPrice ?? 0.01,
      })),
      total: ticket.datos.expectedTotal,
      paymentMethod: 'CASH',
      cashReceived: ticket.recibido,
    };
    ops.push({
      operationId,
      alcance,
      tipo: 'SALE_CASH',
      branchId: lote.snapshot.branchId,
      createdAtLocal: ticket.datos.recordedAt,
      payload,
      payloadHash: await hashPayload(payload),
      estado: ticket.venta ? 'CONFIRMED' : 'LOCAL',
      intentos: 0,
      resultado: ticket.venta
        ? { recurso: { tipo: 'SALE', id: ticket.venta.id_venta }, procesadaEn: ticket.datos.recordedAt }
        : undefined,
      resumen: {
        titulo: `Venta en efectivo · ${lote.snapshot.branchName} (migrada)`,
        total: ticket.datos.expectedTotal,
        moneda: lote.snapshot.currency,
        lineas: lineas.map(({ item, variante }) => ({
          nombre: variante ? `${variante.productName} (${variante.sizeName} / ${variante.colorName})` : 'Prenda',
          cantidad: item.quantity,
          precio: variante?.netUnitPrice,
        })),
      },
      actualizadaEn: new Date().toISOString(),
      legado: { loteId: lote.id, deviceId: lote.deviceId },
    });
  }
  if (ops.length) await guardarOperaciones(...ops);
  localStorage.setItem(`${claveLegado(userId)}:migrado`, crudo);
  localStorage.removeItem(claveLegado(userId));
  return ops.length;
}
