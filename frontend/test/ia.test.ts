import { describe, expect, it } from 'vitest';
import {
  adaptarRecomendacion,
  adaptarReporteIA,
  adaptarRespuestaAsistente,
  esRespuestaIA,
  etiquetaOrigen,
} from '../src/api/ia.contratos';
import { prenda } from './catalogo-fixtures';

const periodo = { from: '2026-09-12', to: '2026-09-13', timeZone: 'America/La_Paz' };

describe('contratos de IA NestJS', () => {
  it('adapta la respuesta del asistente e indica si vino de reglas', () => {
    const r = adaptarRespuestaAsistente({
      reply: 'Te sugiero esta camisa.',
      source: 'rules',
      model: null,
      products: [prenda],
    });
    expect(r.respuesta).toBe('Te sugiero esta camisa.');
    expect(r.productos_sugeridos[0].id_producto).toBe(prenda.id);
    expect(esRespuestaIA(r.origen)).toBe(false);
    expect(etiquetaOrigen('gemini')).toBe('Gemini');
    expect(etiquetaOrigen('ollama:qwen2.5:3b')).toBe('IA local (Ollama)');
    expect(etiquetaOrigen('rules')).toBe('Reglas (sin IA)');
  });

  it('usa una clave estable para recomendaciones de visitantes sin historial', () => {
    const r = adaptarRecomendacion({
      id: null,
      clientId: null,
      productId: prenda.id,
      reason: 'De la temporada en curso',
      score: 0.42,
      source: 'gemini:gemini-2.5-flash',
      createdAt: '2026-09-13T12:00:00.000Z',
      product: prenda,
    });
    expect(r).toMatchObject({
      id_recomendacion: -prenda.id,
      id_cliente: 0,
      motivo: 'De la temporada en curso',
      puntuacion: 0.42,
    });
    expect(r.producto?.nombre).toBe(prenda.name);
  });

  it('adapta el reporte generativo segun el tipo interpretado', () => {
    const ventas = adaptarReporteIA({
      question: 'ventas web de hoy',
      source: 'gemini',
      model: 'gemini-2.5-flash',
      summary: 'Una venta.',
      interpretation: {
        report: 'sales',
        from: '2026-09-12',
        to: '2026-09-13',
        channel: 'WEB',
        branchName: null,
        explanation: 'Ventas web.',
      },
      result: {
        period: periodo,
        totals: [{ currency: 'BOB', saleCount: 1, unitsSold: 2, revenue: 90, averageTicket: 90 }],
        byBranch: [],
        byChannel: [],
        daily: [],
      },
    });
    expect(ventas.tipo).toBe('ventas');
    expect(ventas.interpretacion).toMatchObject({ canal: 'WEB', sucursal: null, desde: '2026-09-12' });
    if (ventas.tipo === 'ventas') expect(ventas.ventas.diario).toHaveLength(2);

    const inventario = adaptarReporteIA({
      question: 'agotados',
      source: 'rules',
      model: null,
      summary: 'Sin stock bajo.',
      interpretation: { report: 'inventory', lowStockOnly: true, branchName: 'La Paz', explanation: 'Inventario.' },
      result: { byBranch: [], items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    });
    expect(inventario).toMatchObject({ tipo: 'inventario', interpretacion: { solo_stock_bajo: true, sucursal: 'La Paz' } });
  });
});
