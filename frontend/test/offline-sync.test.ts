import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { instancia } from '../src/api/http';
import { BASE_URL } from '../src/api/config';
import { guardarToken } from '../src/api/sesion';
import { registrarCambio, registrarReserva, registrarVenta } from '../src/offline/cola';
import { canonico, hashPayload } from '../src/offline/hash';
import { migrarLegado } from '../src/offline/migracion';
import { guardarOperaciones, guardarSnapshot, leerSnapshot, listarOperaciones, stockLocal } from '../src/offline/repositorio';
import { descartar, reintentar, sincronizar } from '../src/offline/sincronizador';
import { ALCANCE, item, limpiarDb, snapshot } from './offline-sync-fixtures';
import { lote } from './offline-fixtures';
import { rechazo, respuesta } from './fixtures';

beforeEach(async () => {
  localStorage.clear();
  guardarToken('jwt-cajero');
  await limpiarDb();
});

const enviados: Array<{ operationId: string; payloadHash: string }> = [];
function servidor(responder: (op: { operationId: string }, i: number) => Record<string, unknown>) {
  enviados.length = 0;
  instancia.defaults.adapter = async (config) => {
    expect(config.url).toBe('/sync/operations');
    const body = JSON.parse(config.data) as { deviceId: string; operations: Array<{ operationId: string; payloadHash: string }> };
    enviados.push(...body.operations);
    return respuesta(config, {
      deviceId: body.deviceId,
      serverTime: new Date().toISOString(),
      results: body.operations.map((op, i) => ({ operationId: op.operationId, attempts: 1, ...responder(op, i) })),
    });
  };
}

describe('repositorio local en IndexedDB', () => {
  it('guarda la venta antes de confirmarla y la conserva tras reabrir la base', async () => {
    const snap = snapshot();
    await guardarSnapshot(snap);
    const op = await registrarVenta(ALCANCE, snap, { items: [item(2)], recibido: 200 });
    expect(op).toMatchObject({
      estado: 'LOCAL',
      tipo: 'SALE_CASH',
      branchId: 2,
      payload: { shiftId: 7, total: 160, paymentMethod: 'CASH', items: [{ ...item(2), unitPrice: 80 }] },
    });
    expect(op.operationId).toMatch(/^[0-9a-f-]{36}$/);
    await limpiarDbSinBorrar();
    expect(await listarOperaciones(ALCANCE)).toHaveLength(1);
    expect((await leerSnapshot(ALCANCE))?.version).toBe('2-1-1');
    expect(stockLocal(snap, await listarOperaciones(ALCANCE), item())).toBe(1);
    await expect(registrarVenta(ALCANCE, snap, { items: [item(2)], recibido: 200 })).rejects.toThrow('stock local');
    await expect(registrarVenta(ALCANCE, snap, { items: [item(1)], recibido: 10 })).rejects.toThrow('efectivo');
  });

  it('valida la reserva offline y exige una visita futura', async () => {
    const snap = snapshot();
    await expect(
      registrarReserva(ALCANCE, snap, { items: [item()], horario: '2020-01-01T10:00' }),
    ).rejects.toThrow('futura');
    const op = await registrarReserva(ALCANCE, snap, {
      items: [item()],
      horario: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(op).toMatchObject({ tipo: 'RESERVATION', estado: 'LOCAL', payload: { items: [item()] } });
  });

  it('calcula el mismo hash canonico que el backend', async () => {
    const payload = { b: 1, a: [{ d: 2, c: 'x' }] };
    expect(canonico(payload)).toBe('{"a":[{"c":"x","d":2}],"b":1}');
    expect(await hashPayload(payload)).toBe(createHash('sha256').update(canonico(payload)).digest('hex'));
  });
});

describe('sincronizador', () => {
  it('envia las pendientes, aplica cada resultado y nunca borra operaciones', async () => {
    const snap = snapshot({ variants: [{ ...snapshot().variants[0]!, available: 10 }] });
    const confirmada = await registrarVenta(ALCANCE, snap, { items: [item()], recibido: 80 });
    const conflicto = await registrarVenta(ALCANCE, snap, { items: [item()], recibido: 80 });
    const rechazada = await registrarVenta(ALCANCE, snap, { items: [item()], recibido: 80 });
    servidor((_op, i) =>
      [
        { status: 'CONFIRMED', resourceType: 'SALE', resourceId: 71 },
        { status: 'CONFLICT', code: 'STOCK_INSUFFICIENT', detail: { variants: [{ ...item(), requested: 1, available: 0 }] } },
        { status: 'REJECTED', code: 'INVALID_DATA' },
      ][i]!,
    );
    const resumen = await sincronizar(ALCANCE);
    expect(resumen).toMatchObject({ enviadas: 3, confirmadas: 1, conflictos: 1, rechazadas: 1 });
    expect(enviados.map((o) => o.operationId)).toEqual([confirmada.operationId, conflicto.operationId, rechazada.operationId]);
    expect(enviados[0]!.payloadHash).toBe(confirmada.payloadHash);
    const ops = await listarOperaciones(ALCANCE);
    expect(ops).toHaveLength(3);
    const porId = (id: string) => ops.find((o) => o.operationId === id)!;
    expect(porId(confirmada.operationId)).toMatchObject({ estado: 'CONFIRMED', resultado: { recurso: { tipo: 'SALE', id: 71 } } });
    expect(porId(conflicto.operationId)).toMatchObject({ estado: 'CONFLICT', resultado: { codigo: 'STOCK_INSUFFICIENT' } });
    expect(porId(rechazada.operationId).estado).toBe('REJECTED');

    // Las finales y los conflictos no se reenvian solos; el conflicto se reintenta a pedido.
    servidor(() => ({ status: 'CONFIRMED', resourceType: 'SALE', resourceId: 72 }));
    expect((await sincronizar(ALCANCE)).enviadas).toBe(0);
    await reintentar(ALCANCE, conflicto.operationId);
    expect(enviados.map((o) => o.operationId)).toEqual([conflicto.operationId]);
    expect((await listarOperaciones(ALCANCE)).find((o) => o.operationId === conflicto.operationId)?.estado).toBe('CONFIRMED');
  });

  it('ante un fallo de red pasa a RETRY con espera creciente y conserva la operacion', async () => {
    const op = await registrarVenta(ALCANCE, snapshot(), { items: [item()], recibido: 80 });
    instancia.defaults.adapter = async () => {
      throw new Error('Network Error');
    };
    const resumen = await sincronizar(ALCANCE);
    expect(resumen.reintentos).toBe(1);
    const [guardada] = await listarOperaciones(ALCANCE);
    expect(guardada).toMatchObject({ operationId: op.operationId, estado: 'RETRY', intentos: 1 });
    expect(guardada!.siguienteIntento).toBeGreaterThan(Date.now());
    // Antes de la espera no se reintenta; un 5xx tampoco borra nada.
    servidor(() => ({ status: 'CONFIRMED', resourceType: 'SALE', resourceId: 9 }));
    expect((await sincronizar(ALCANCE)).enviadas).toBe(0);
    await guardarOperaciones({ ...guardada!, siguienteIntento: Date.now() - 1 });
    instancia.defaults.adapter = async (config) => {
      throw rechazo(config, 503, 'Service Unavailable');
    };
    await sincronizar(ALCANCE);
    expect((await listarOperaciones(ALCANCE))[0]).toMatchObject({ estado: 'RETRY', intentos: 2 });
  });

  it('reenvia con el mismo id un envio interrumpido y un ERROR transitorio del servidor', async () => {
    const op = await registrarVenta(ALCANCE, snapshot(), { items: [item()], recibido: 80 });
    await guardarOperaciones({ ...op, estado: 'SENDING' });
    servidor(() => ({ status: 'ERROR', code: 'SERVER_ERROR' }));
    await sincronizar(ALCANCE);
    expect(enviados[0]!.operationId).toBe(op.operationId);
    expect((await listarOperaciones(ALCANCE))[0]!.estado).toBe('RETRY');
  });

  it('descartar conserva la operacion; una confirmada no se descarta', async () => {
    const op = await registrarVenta(ALCANCE, snapshot(), { items: [item()], recibido: 80 });
    await descartar(op);
    expect((await listarOperaciones(ALCANCE))[0]).toMatchObject({ estado: 'DESCARTADA' });
    await expect(descartar({ ...op, estado: 'CONFIRMED' })).rejects.toThrow();
  });

  it('el stock local no descuenta dos veces lo confirmado antes de la descarga', () => {
    const snap = snapshot();
    const base = {
      alcance: ALCANCE,
      tipo: 'SALE_CASH' as const,
      branchId: 2,
      createdAtLocal: '',
      payload: { items: [item(1)] },
      payloadHash: '',
      intentos: 1,
      resumen: { titulo: '', lineas: [] },
      actualizadaEn: '',
    };
    const antes = { ...base, operationId: 'a', estado: 'CONFIRMED' as const, resultado: { procesadaEn: '2000-01-01T00:00:00.000Z' } };
    const despues = { ...base, operationId: 'b', estado: 'CONFIRMED' as const, resultado: { procesadaEn: '2999-01-01T00:00:00.000Z' } };
    const descartada = { ...base, operationId: 'c', estado: 'DESCARTADA' as const };
    expect(stockLocal(snap, [antes, despues, descartada], item())).toBe(2);
  });
});

describe('migracion de la caja offline del parcial 1', () => {
  it('pasa los tickets de localStorage a IndexedDB conservando id y lote, y guarda respaldo', async () => {
    const legado = lote();
    const clave = `fs.offline.v1:${BASE_URL}:12`;
    localStorage.setItem(
      clave,
      JSON.stringify({
        version: 1,
        lote: legado,
        finalizando: false,
        tickets: [
          {
            recibido: 100,
            datos: {
              deviceId: legado.deviceId,
              idempotencyKey: '1b7d1a62-0a2b-4c0e-9c4b-1d2e3f4a5b6c',
              recordedAt: new Date().toISOString(),
              expectedTotal: 80,
              items: [item()],
            },
          },
          {
            recibido: 80,
            venta: { id_venta: 71 },
            datos: {
              deviceId: legado.deviceId,
              idempotencyKey: '2b7d1a62-0a2b-4c0e-9c4b-1d2e3f4a5b6c',
              recordedAt: new Date().toISOString(),
              expectedTotal: 80,
              items: [item()],
            },
          },
        ],
      }),
    );
    expect(await migrarLegado(12, ALCANCE)).toBe(2);
    const ops = await listarOperaciones(ALCANCE);
    const pendiente = ops.find((o) => o.operationId.startsWith('1b7d'))!;
    expect(pendiente).toMatchObject({
      estado: 'LOCAL',
      legado: { loteId: legado.id, deviceId: legado.deviceId },
      payload: { offlineBatchId: legado.id, shiftId: 1, total: 80, items: [{ ...item(), unitPrice: 80 }] },
    });
    expect(ops.find((o) => o.operationId.startsWith('2b7d'))?.estado).toBe('CONFIRMED');
    expect(localStorage.getItem(clave)).toBeNull();
    expect(localStorage.getItem(`${clave}:migrado`)).toContain('1b7d1a62');
    expect(await migrarLegado(12, ALCANCE)).toBe(0);

    // Al confirmar todos sus tickets se finaliza el lote antiguo en el servidor.
    const urls: string[] = [];
    instancia.defaults.adapter = async (config) => {
      urls.push(config.url!);
      if (config.url === '/sync/operations') {
        const body = JSON.parse(config.data);
        return respuesta(config, {
          results: body.operations.map((o: { operationId: string }) => ({
            operationId: o.operationId,
            status: 'CONFIRMED',
            resourceType: 'SALE',
            resourceId: 72,
            attempts: 1,
          })),
        });
      }
      expect(JSON.parse(config.data).keys.sort()).toEqual(ops.map((o) => o.operationId).sort());
      return respuesta(config, { finishedAt: new Date().toISOString() });
    };
    await sincronizar(ALCANCE);
    expect(urls).toEqual(['/sync/operations', `/sales/offline/${legado.id}/finish`]);
  });
});

/** Simula cerrar y reabrir el navegador: nueva conexion, mismos datos. */
async function limpiarDbSinBorrar() {
  const { cerrarDb } = await import('../src/offline/db');
  await cerrarDb();
}

describe('registro completo y cambios de prendas offline (F7)', () => {
  it('guarda empresa y usuario en la venta y los envia para que el servidor los verifique', async () => {
    const op = await registrarVenta(ALCANCE, snapshot(), { items: [item()], recibido: 80, usuarioId: 12 });
    expect(op).toMatchObject({ tenantId: 1, userId: 12, branchId: 2, createdAtLocal: expect.any(String) });
    servidor(() => ({ status: 'CONFIRMED', resourceType: 'SALE', resourceId: 1 }));
    await sincronizar(ALCANCE);
    expect(enviados[0]).toMatchObject({ tenantId: 1, userId: 12, type: 'SALE_CASH' });
  });

  it('registra un cambio de prenda como operacion EXCHANGE identificando la linea por variante', async () => {
    const otra = { ...snapshot().variants[0]!, sizeId: 2, sizeName: 'L', netUnitPrice: 90 };
    const snap = snapshot({ variants: [...snapshot().variants, otra] });
    await expect(
      registrarCambio(ALCANCE, snap, { ventaId: 0, devuelta: item(), nueva: { ...item(), sizeId: 2 }, cantidad: 1 }),
    ).rejects.toThrow('numero de la venta');
    const op = await registrarCambio(ALCANCE, snap, {
      ventaId: 40,
      devuelta: item(),
      nueva: { ...item(), sizeId: 2 },
      cantidad: 1,
      motivo: 'Talla',
      usuarioId: 12,
    });
    expect(op).toMatchObject({
      tipo: 'EXCHANGE',
      estado: 'LOCAL',
      payload: {
        saleId: 40,
        returnedProductId: 1,
        returnedSizeId: 1,
        returnedColorId: 1,
        newSizeId: 2,
        quantity: 1,
        shiftId: 7,
        reason: 'Talla',
      },
    });
    expect(op.resumen.lineas.map((l) => l.nombre)).toEqual(['Devuelve Camisa (M / Azul)', 'Lleva Camisa (L / Azul)']);
  });
});
