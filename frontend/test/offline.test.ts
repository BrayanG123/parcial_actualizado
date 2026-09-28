import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instancia } from '../src/api/http';
import { adaptarUsuario } from '../src/api/auth.contratos';
import { guardarToken } from '../src/api/sesion';
import {
  prepararOffline,
  guardarTicketOffline,
  leerOffline,
  sincronizarOffline,
  finalizarOffline,
  disponibles,
} from '../src/lib/offline';
import { identidadOffline } from '../src/lib/offline-identidad';
import { respuesta, rechazo, usuarioBackend } from './fixtures';
import { venta } from './pos-fixtures';
import { instalarLocks, lote } from './offline-fixtures';
const usuario = adaptarUsuario(usuarioBackend);
const item = (quantity = 1) => ({ productId: 1, sizeId: 1, colorId: 1, quantity });
beforeEach(() => {
  localStorage.clear();
  guardarToken('offline-test');
  instalarLocks();
  instancia.defaults.adapter = async (c) => respuesta(c, lote());
});
afterEach(() => vi.restoreAllMocks());
describe('cola durable de ventas offline', () => {
  it('downloads once per preparation and scopes durable records and offline identity by API/user/token', async () => {
    const adapter = vi.fn(async (c: import('axios').InternalAxiosRequestConfig) =>
      respuesta(c, lote()),
    );
    instancia.defaults.adapter = adapter;
    await prepararOffline(usuario, 1);
    await prepararOffline(usuario, 1);
    expect(adapter).toHaveBeenCalledOnce();
    expect(leerOffline(12)?.lote.shiftId).toBe(1);
    expect(leerOffline(13)).toBeNull();
    expect(identidadOffline()?.id_usuario).toBe(12);
    guardarToken('otra-sesion');
    expect(identidadOffline()).toBeNull();
    expect(leerOffline(12)).not.toBeNull();
  });
  it('serializes concurrent tabs and prevents selling the downloaded stock twice', async () => {
    await prepararOffline(usuario, 1);
    const result = await Promise.allSettled([
      guardarTicketOffline(12, [item(2)], 160),
      guardarTicketOffline(12, [item(2)], 160),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const state = leerOffline(12)!;
    expect(state.tickets).toHaveLength(1);
    expect(disponibles(state, item())).toBe(1);
  });
  it('does not acknowledge a sale if local storage fails and rejects insufficient cash', async () => {
    await prepararOffline(usuario, 1);
    await expect(guardarTicketOffline(12, [item()], 1)).rejects.toThrow('cubrir');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    await expect(guardarTicketOffline(12, [item()], 80)).rejects.toThrow('QuotaExceeded');
    expect(leerOffline(12)!.tickets).toHaveLength(0);
  });
  it('retries an uncertain response with the exact same UUID and does not finalize pending tickets', async () => {
    await prepararOffline(usuario, 1);
    const ticket = await guardarTicketOffline(12, [item(2)], 200);
    const seen: unknown[] = [];
    instancia.defaults.adapter = async (c) => {
      seen.push(JSON.parse(c.data));
      throw new Error('Respuesta perdida');
    };
    await sincronizarOffline(12);
    expect(leerOffline(12)!.tickets[0].venta).toBeUndefined();
    await expect(finalizarOffline(12)).rejects.toThrow('todos los tickets');
    instancia.defaults.adapter = async (c) => {
      seen.push(JSON.parse(c.data));
      return respuesta(c, venta);
    };
    await sincronizarOffline(12);
    expect(seen).toEqual([ticket.datos, ticket.datos]);
    expect(leerOffline(12)!.tickets[0].venta?.id_venta).toBe(71);
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toContain('/finish');
      expect(JSON.parse(c.data).keys).toEqual([ticket.datos.idempotencyKey]);
      return respuesta(c, { finishedAt: new Date().toISOString() });
    };
    await finalizarOffline(12);
    expect(leerOffline(12)).toBeNull();
  });
  it('retains a stock conflict for explicit retry and locks new tickets during uncertain finalization', async () => {
    await prepararOffline(usuario, 1);
    await guardarTicketOffline(12, [item(2)], 160);
    const adapter = vi.fn(async (c: import('axios').InternalAxiosRequestConfig) => {
      throw rechazo(c, 409, 'Stock insuficiente');
    });
    instancia.defaults.adapter = adapter;
    await sincronizarOffline(12);
    await sincronizarOffline(12);
    expect(adapter).toHaveBeenCalledOnce();
    expect(leerOffline(12)!.tickets[0].conflicto).toBe(true);
    instancia.defaults.adapter = async (c) => respuesta(c, venta);
    await sincronizarOffline(12, true);
    instancia.defaults.adapter = async () => {
      throw new Error('Respuesta perdida');
    };
    await expect(finalizarOffline(12)).rejects.toThrow();
    expect(leerOffline(12)!.finalizando).toBe(true);
    await expect(guardarTicketOffline(12, [item()], 80)).rejects.toThrow('Prepara');
    instancia.defaults.adapter = async (c) =>
      respuesta(c, { finishedAt: new Date().toISOString() });
    await finalizarOffline(12);
    expect(leerOffline(12)).toBeNull();
  });
  it('stops creating tickets after the downloaded prices expire but retains them for later synchronization', async () => {
    const snapshot = lote();
    snapshot.snapshot.expiresAt = new Date(Date.now() - 1000).toISOString();
    instancia.defaults.adapter = async (c) => respuesta(c, snapshot);
    await prepararOffline(usuario, 1);
    await expect(guardarTicketOffline(12, [item()], 80)).rejects.toThrow('vencio');
    expect(leerOffline(12)).not.toBeNull();
  });
});
