import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { reservasService } from '../src/services/reservas.service';
import { adaptarReserva } from '../src/api/reservas.contratos';
import { SIGUIENTES_RESERVA, CANCELABLES_CLIENTE } from '../src/lib/reservas';
import { EstadoReserva } from '../src/types/domain';
import { respuesta, rechazo } from './fixtures';
import { pagina } from './catalogo-fixtures';
import { reserva, datosReserva } from './reservas-fixtures';
beforeEach(() => guardarToken('sesion-test'));
describe('reservas sobre contrato NestJS', () => {
  it('adapta reservedAt, vencimiento, cliente, sucursal y estados de cada prenda', () => {
    expect(adaptarReserva(reserva)).toMatchObject({
      fecha_reserva: reserva.reservedAt,
      vence_en: reserva.expiresAt,
      estado: 'PENDIENTE',
      cliente: { nombre: 'Ana', telefono: '' },
      sucursal: { nombre: 'Centro' },
      detalles: [{ estado: 'Pendiente', cantidad: 2, producto: { nombre: 'Camisa' } }],
    });
    expect(
      adaptarReserva({
        ...reserva,
        status: 'EXPIRED',
        items: [{ ...reserva.items[0], status: 'UNAVAILABLE' }],
      }),
    ).toMatchObject({ estado: 'VENCIDA', detalles: [{ estado: 'No disponible' }] });
  });
  it('separa el listado propio del operativo y conserva filtros y paginacion', async () => {
    const rutas: string[] = [];
    instancia.defaults.adapter = async (c) => {
      rutas.push(c.url!);
      expect(c.params).toMatchObject({ page: 2, limit: 10, branchId: 2, status: 'READY' });
      expect(c.params.estado).toBeUndefined();
      return respuesta(c, pagina([reserva], 2, 10, 11));
    };
    const filtros = { page: 2, page_size: 10, id_sucursal: 2, estado: EstadoReserva.LISTA };
    expect(await reservasService.propias(filtros)).toMatchObject({ page: 2, total: 11 });
    await reservasService.listar(filtros);
    expect(rutas).toEqual(['/reservations/mine', '/reservations']);
  });
  it('crea varias prendas sin ids de cliente ni campos visuales y conserva zona horaria', async () => {
    instancia.defaults.adapter = async (c) => {
      expect(c.method).toBe('post');
      expect(c.url).toBe('/reservations');
      expect(JSON.parse(c.data)).toEqual({
        branchId: 2,
        approximateTime: '2100-09-12T18:00:00Z',
        observation: datosReserva.observacion,
        items: [
          { productId: 1, sizeId: 9, colorId: 10, quantity: 2 },
          { productId: 2, sizeId: 9, colorId: 10, quantity: 1 },
        ],
      });
      return respuesta(c, reserva);
    };
    expect(await reservasService.crear(datosReserva)).toMatchObject({ id_reserva: 50 });
  });
  it.each(['2000-01-01T12:00:00Z', '2100-01-01', '2100-01-01T12:00', 'invalida'])(
    'rechaza horario %s',
    async (horario) => {
      const adapter = vi.fn();
      instancia.defaults.adapter = adapter;
      await expect(
        reservasService.crear({ ...datosReserva, horario_aproximado: horario }),
      ).rejects.toMatchObject({ status: 400 });
      expect(adapter).not.toHaveBeenCalled();
    },
  );
  it('rechaza variantes duplicadas, exceso de lineas y cantidades invalidas', async () => {
    const adapter = vi.fn();
    instancia.defaults.adapter = adapter;
    const detalle = datosReserva.detalles[0];
    for (const detalles of [
      [],
      [detalle, detalle],
      [{ ...detalle, cantidad: 0 }],
      [{ ...detalle, cantidad: 101 }],
      [{ ...detalle, cantidad: 1.5 }],
      Array.from({ length: 51 }, (_, i) => ({ ...detalle, id_producto: i + 1 })),
    ]) {
      await expect(reservasService.crear({ ...datosReserva, detalles })).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(adapter).not.toHaveBeenCalled();
  });
  it('cancela con PATCH y cambia estado con el enum del servidor', async () => {
    const rutas: string[] = [];
    instancia.defaults.adapter = async (c) => {
      expect(c.method).toBe('patch');
      rutas.push(c.url!);
      if (c.url?.endsWith('/status'))
        expect(JSON.parse(c.data)).toEqual({ status: 'CUSTOMER_PRESENT' });
      return respuesta(c, reserva);
    };
    await reservasService.cancelar(50);
    await reservasService.cambiarEstado(50, EstadoReserva.CLIENTE_PRESENTE);
    expect(rutas).toEqual(['/reservations/50/cancel', '/reservations/50/status']);
  });
  it('no ofrece vencimiento manual y limita la cancelacion del cliente a los estados previos a su llegada', async () => {
    expect(SIGUIENTES_RESERVA.LISTA).toEqual(['CLIENTE_PRESENTE', 'CANCELADA']);
    expect(SIGUIENTES_RESERVA.ATENDIDA).toEqual([]);
    expect(CANCELABLES_CLIENTE).not.toContain('CLIENTE_PRESENTE');
    await expect(reservasService.cambiarEstado(50, EstadoReserva.VENCIDA)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('conserva el error de vencimiento y traduce conflictos de stock', async () => {
    instancia.defaults.adapter = async (c) => {
      throw rechazo(c, 409, 'The reservation expired and its stock was released');
    };
    await expect(reservasService.cancelar(50)).rejects.toMatchObject({
      status: 409,
      message: 'La reserva vencio y las prendas ya fueron liberadas.',
    });
    instancia.defaults.adapter = async (c) => {
      throw rechazo(c, 409, 'Insufficient stock or invalid variant: product 1, size 9, color 10');
    };
    await expect(reservasService.crear(datosReserva)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('suficientes unidades'),
    });
  });
});
