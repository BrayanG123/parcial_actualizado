import { beforeEach, describe, expect, it } from 'vitest';
import { adaptarVenta } from '../src/api/ventas.contratos';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { posService } from '../src/services/pos.service';
import { filtrosVentasApi, ventasService } from '../src/services/ventas.service';
import { borrarCobro, guardarCobro, recuperarCobro, resultadoIncierto } from '../src/lib/pos';
import { subtotal } from '../src/lib/domain';
import { ErrorApi } from '../src/types/api';
import { cobro, cotizacion, reservaPOS, venta } from './pos-fixtures';
import { respuesta } from './fixtures';
import { pagina } from './catalogo-fixtures';

beforeEach(() => {
  guardarToken('cashier-test');
  sessionStorage.clear();
});
describe('contratos de ventas y POS', () => {
  it('preserves historical snapshots and converts per-unit discounts to line discounts', () => {
    const v = adaptarVenta(venta);
    expect(v).toMatchObject({
      id_venta: 71,
      moneda: 'BOB',
      estado: 'PAGADA',
      comprobante_disponible: true,
    });
    expect(v.detalles[0].producto?.nombre).toBe('Camisa original');
    const d = v.detalles[0];
    expect(d.descuento).toBe(40);
    expect(subtotal(d.cantidad, d.precio_unitario, d.descuento)).toBe(160);
    expect(adaptarVenta({ ...venta, status: 'PAID' }).comprobante_disponible).toBe(false);
    expect(adaptarVenta({ ...venta, status: 'REFUNDED' }).estado).toBe('REEMBOLSADA');
  });
  it('uses customer-owned histories and inclusive Bolivia date filters', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.url).toBe('/sales/mine');
      expect(c.params).toMatchObject({
        page: 2,
        limit: 15,
        from: '2026-09-12T00:00:00.000-04:00',
        to: '2026-09-12T23:59:59.999-04:00',
      });
      return respuesta(c, pagina([venta]));
    };
    expect(
      (
        await ventasService.propias({
          page: 2,
          page_size: 15,
          desde: '2026-09-12',
          hasta: '2026-09-12',
        })
      ).items[0].id_venta,
    ).toBe(71);
    expect(() => filtrosVentasApi({ desde: '2026-09-13', hasta: '2026-09-12' })).toThrow(
      'fecha final',
    );
  });
  it('uses dedicated POS and receipt endpoints and transmits the same key on retry', async () => {
    const seen: string[] = [];
    instancia.defaults.adapter = async (c) => {
      seen.push(c.url!);
      if (c.url === '/sales/in-store/reservations/9') {
        expect(c.params.branchId).toBe(2);
        return respuesta(c, reservaPOS);
      }
      if (c.url === '/sales/in-store/customers') {
        expect(c.params).toEqual({ branchId: 2, search: 'Ana' });
        return respuesta(c, [reservaPOS.client]);
      }
      if (c.url === '/sales/in-store/preview') {
        expect(JSON.parse(c.data).expectedTotal).toBeUndefined();
        return respuesta(c, cotizacion);
      }
      if (c.url === '/sales/in-store') {
        expect(JSON.parse(c.data)).toEqual(cobro);
        return respuesta(c, venta);
      }
      expect(c.url).toBe('/sales/71/receipt');
      return respuesta(c, { ...venta, receiptNumber: 'FS-00000071' });
    };
    await posService.reserva(9, 2);
    await posService.clientes(2, 'Ana');
    await posService.revisar({ branchId: 2, items: cobro.items });
    await posService.cobrar(cobro);
    await posService.cobrar(cobro);
    expect((await ventasService.comprobante(71)).numero_comprobante).toBe('FS-00000071');
    expect(seen.filter((u) => u === '/sales/in-store')).toHaveLength(2);
  });
  it('recovers the exact pending request per user and retains uncertain failures', () => {
    guardarCobro(12, cobro);
    expect(recuperarCobro(12)).toEqual(cobro);
    expect(recuperarCobro(13)).toBeNull();
    for (const status of [0, 401, 403, 500, 503])
      expect(resultadoIncierto(new ErrorApi('error', status))).toBe(true);
    expect(resultadoIncierto(new ErrorApi('Prices changed', 409))).toBe(false);
    borrarCobro(12);
    expect(recuperarCobro(12)).toBeNull();
  });
});
