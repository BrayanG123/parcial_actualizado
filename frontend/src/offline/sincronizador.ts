/**
 * Sincronizador: envia las operaciones pendientes a POST /sync/operations y guarda el
 * resultado de cada una. Nunca borra una operacion local por haber intentado enviarla.
 *
 *   LOCAL -> SENDING -> CONFIRMED | REJECTED | CONFLICT
 *                    -> RETRY (fallo de red o del servidor, con espera creciente)
 */
import { ErrorApi } from '../types/api';
import { offlineService } from '../services/offline.service';
import { syncApi, type ResultadoServidor } from './api';
import { conBloqueo } from './bloqueo';
import { guardarMeta, guardarOperaciones, idDispositivo, leerMeta, listarOperaciones } from './repositorio';
import type { OperacionLocal } from './tipos';

const LOTE = 50;
const ESPERA_BASE_MS = 5000;
const ESPERA_MAX_MS = 5 * 60 * 1000;

export const esperaReintento = (intentos: number) =>
  Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1));

export interface ResumenSincronizacion {
  enviadas: number;
  confirmadas: number;
  conflictos: number;
  rechazadas: number;
  reintentos: number;
  sinConexion?: boolean;
}

function aplicar(op: OperacionLocal, r: ResultadoServidor): OperacionLocal {
  const resultado = {
    codigo: r.code,
    mensaje: r.message,
    detalle: r.detail,
    recurso: r.resourceType && r.resourceId ? { tipo: r.resourceType, id: r.resourceId } : null,
    procesadaEn: r.processedAt ?? new Date().toISOString(),
  };
  if (r.status === 'CONFIRMED' || r.status === 'REJECTED' || r.status === 'CONFLICT')
    return { ...op, estado: r.status, intentos: op.intentos + 1, resultado, siguienteIntento: undefined };
  // ERROR o PROCESSING: el servidor no termino; se reintenta mas tarde con el mismo id.
  const intentos = op.intentos + 1;
  return { ...op, estado: 'RETRY', intentos, resultado, siguienteIntento: Date.now() + esperaReintento(intentos) };
}

/**
 * Envia lo pendiente. `incluir` fuerza el reenvio de operaciones en conflicto que el
 * usuario decidio reintentar (mismo operationId: el servidor no duplica).
 */
export function sincronizar(alcance: string, incluir: string[] = []): Promise<ResumenSincronizacion> {
  return conBloqueo(`sync:${alcance}`, async () => {
    const resumen: ResumenSincronizacion = { enviadas: 0, confirmadas: 0, conflictos: 0, rechazadas: 0, reintentos: 0 };
    const ahora = Date.now();
    const todas = await listarOperaciones(alcance);
    const candidatas = todas
      .filter(
        (op) =>
          op.estado === 'LOCAL' ||
          // Un envio interrumpido (pestana cerrada) se reenvia: es idempotente.
          op.estado === 'SENDING' ||
          (op.estado === 'RETRY' && (op.siguienteIntento ?? 0) <= ahora) ||
          (incluir.includes(op.operationId) && (op.estado === 'CONFLICT' || op.estado === 'RETRY')),
      )
      .sort((a, b) => a.createdAtLocal.localeCompare(b.createdAtLocal) || (a.orden ?? 0) - (b.orden ?? 0));
    if (!candidatas.length) return resumen;
    const deviceId = await idDispositivo();
    for (let i = 0; i < candidatas.length; i += LOTE) {
      const lote = candidatas.slice(i, i + LOTE).map((op) => ({ ...op, estado: 'SENDING' as const }));
      // Se marca SENDING y se persiste antes de transmitir.
      await guardarOperaciones(...lote);
      let respuesta;
      try {
        respuesta = await syncApi.enviar(
          deviceId,
          lote.map((op) => ({
            operationId: op.operationId,
            type: op.tipo,
            branchId: op.branchId,
            createdAtLocal: op.createdAtLocal,
            payload: op.payload,
            payloadHash: op.payloadHash,
          })),
        );
      } catch (error) {
        const status = error instanceof ErrorApi ? error.status : 0;
        const reintentos = lote.map((op) => ({
          ...op,
          estado: 'RETRY' as const,
          intentos: op.intentos + 1,
          siguienteIntento: Date.now() + esperaReintento(op.intentos + 1),
          resultado: {
            ...op.resultado,
            codigo: status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`,
            mensaje: error instanceof Error ? error.message : 'No se pudo enviar',
          },
        }));
        await guardarOperaciones(...reintentos);
        resumen.reintentos += reintentos.length;
        resumen.sinConexion = status === 0;
        return resumen;
      }
      const actualizadas = lote.map((op) => {
        const r = respuesta.results.find((x) => x.operationId === op.operationId);
        return r ? aplicar(op, r) : { ...op, estado: 'RETRY' as const, siguienteIntento: Date.now() + ESPERA_BASE_MS };
      });
      await guardarOperaciones(...actualizadas);
      resumen.enviadas += lote.length;
      for (const op of actualizadas) {
        if (op.estado === 'CONFIRMED') resumen.confirmadas++;
        else if (op.estado === 'CONFLICT') resumen.conflictos++;
        else if (op.estado === 'REJECTED') resumen.rechazadas++;
        else resumen.reintentos++;
      }
    }
    await finalizarLotesLegados(alcance);
    await guardarMeta(`ultima-sync:${alcance}`, new Date().toISOString());
    return resumen;
  });
}

export const ultimaSincronizacion = (alcance: string) => leerMeta<string>(`ultima-sync:${alcance}`);

/** El usuario reintenta una operacion en conflicto (p. ej. tras corregir el stock). */
export function reintentar(alcance: string, operationId: string) {
  return sincronizar(alcance, [operationId]);
}

/** Descartar no borra: la operacion queda en el historial como DESCARTADA. */
export async function descartar(op: OperacionLocal, nota = 'Descartada por el usuario') {
  if (op.estado === 'CONFIRMED' || op.estado === 'SENDING')
    throw new Error('Una operacion confirmada o en envio no se puede descartar.');
  await guardarOperaciones({ ...op, estado: 'DESCARTADA', nota });
}

/**
 * Lotes del parcial 1: cuando todos sus tickets migrados estan confirmados se
 * finaliza el lote en el servidor para liberar la caja normal y el cierre del turno.
 */
async function finalizarLotesLegados(alcance: string) {
  const ops = (await listarOperaciones(alcance)).filter((op) => op.legado);
  const lotes = new Map<string, OperacionLocal[]>();
  for (const op of ops) lotes.set(op.legado!.loteId, [...(lotes.get(op.legado!.loteId) ?? []), op]);
  for (const [loteId, tickets] of lotes) {
    if (await leerMeta<boolean>(`lote-finalizado:${loteId}`)) continue;
    if (tickets.some((t) => t.estado !== 'CONFIRMED')) continue;
    try {
      await offlineService.finalizar(loteId, {
        deviceId: tickets[0]!.legado!.deviceId,
        keys: tickets.map((t) => t.operationId),
      });
      await guardarMeta(`lote-finalizado:${loteId}`, true);
    } catch {
      /* Se reintenta en la proxima sincronizacion. */
    }
  }
}
