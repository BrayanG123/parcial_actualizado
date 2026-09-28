import { promocionVigente, stockDisponible } from '../../lib/domain';
import type { RecomendacionIA } from '../../types/domain';
import type { RespuestaAsistente } from '../../types/ia';
import { categorias, inventario, productos, siguienteId, ventas } from '../db';
import { expandirProducto, num, texto, type RutaMock } from '../core';

/**
 * Sustituto local del servicio de IA.
 * Cuando NestJS exponga Gemini, estos endpoints devuelven la misma forma
 * y el frontend no cambia.
 */

function productosDisponibles() {
  return productos.filter(
    (p) => p.activo && inventario.some((i) => i.id_producto === p.id_producto && stockDisponible(i) > 0),
  );
}

function sugerirPorTexto(consulta: string) {
  const q = consulta.toLowerCase();
  const categoria = categorias.find((c) => q.includes(c.nombre.toLowerCase().slice(0, 5)));
  let candidatos = productosDisponibles();

  if (categoria) candidatos = candidatos.filter((p) => p.id_categoria === categoria.id_categoria);
  if (q.includes('oferta') || q.includes('descuento') || q.includes('promo')) {
    candidatos = candidatos.filter((p) => promocionVigente(p));
  }
  if (q.includes('oficina') || q.includes('trabajo') || q.includes('formal')) {
    candidatos = candidatos.filter((p) => p.id_coleccion === 3 || p.id_categoria === 4);
  }
  if (q.includes('fiesta') || q.includes('noche') || q.includes('evento')) {
    candidatos = candidatos.filter((p) => p.id_coleccion === 2);
  }
  const barato = q.match(/(\d{2,4})/);
  if (barato && (q.includes('menos de') || q.includes('hasta') || q.includes('presupuesto'))) {
    candidatos = candidatos.filter((p) => p.precio <= Number(barato[1]));
  }

  if (candidatos.length === 0) candidatos = productosDisponibles();
  return candidatos.slice(0, 3).map(expandirProducto);
}

function redactar(consulta: string, cantidad: number): string {
  if (cantidad === 0) {
    return 'Por ahora no encuentro prendas disponibles con esas caracteristicas. Puedes ampliar el rango de precio o revisar otra categoria.';
  }
  const q = consulta.toLowerCase();
  if (q.includes('oficina') || q.includes('trabajo')) {
    return 'Para la oficina te sugiero combinar sastreria con prendas de caida fluida. Estas opciones funcionan bien juntas:';
  }
  if (q.includes('fiesta') || q.includes('noche')) {
    return 'Para un evento de noche, los tejidos satinados y los cortes midi son una apuesta segura. Mira estas prendas:';
  }
  if (q.includes('combin')) {
    return 'Puedes combinar estas piezas entre si; comparten paleta y se adaptan a un look de dia o de noche:';
  }
  return 'Segun lo que buscas y el stock actual de nuestras sucursales, estas prendas te pueden interesar:';
}

export const rutasIA: RutaMock[] = [
  {
    metodo: 'POST',
    patron: /^\/ia\/asistente$/,
    handler: ({ body }): RespuestaAsistente => {
      const consulta = String(body?.mensaje ?? '').trim();
      const sugeridos = consulta ? sugerirPorTexto(consulta) : [];
      return { respuesta: redactar(consulta, sugeridos.length), productos_sugeridos: sugeridos };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/ia\/recomendaciones$/,
    handler: ({ params, usuario }): RecomendacionIA[] => {
      const idCliente = usuario?.id_cliente ?? 0;
      const limite = num(params.limite) ?? 4;
      const base = texto(params.contexto);

      // Heuristica local: prioriza categorias que el cliente ya compro,
      // luego promociones vigentes, siempre con stock disponible.
      const compradas = new Set(
        ventas
          .filter((v) => v.id_cliente === idCliente)
          .flatMap((v) => v.detalles.map((d) => productos[d.id_producto - 1]?.id_categoria)),
      );

      const puntuar = (idCategoria: number, enPromo: boolean) =>
        Math.min(0.99, (compradas.has(idCategoria) ? 0.7 : 0.4) + (enPromo ? 0.2 : 0));

      return productosDisponibles()
        .filter((p) => (base ? p.nombre.toLowerCase().includes(base) : true))
        .map((p) => ({ p, enPromo: promocionVigente(p) }))
        .sort((a, b) => puntuar(b.p.id_categoria, b.enPromo) - puntuar(a.p.id_categoria, a.enPromo))
        .slice(0, limite)
        .map(({ p, enPromo }) => ({
          id_recomendacion: siguienteId('recomendacion'),
          id_cliente: idCliente,
          id_producto: p.id_producto,
          fecha: new Date().toISOString(),
          motivo: compradas.has(p.id_categoria)
            ? 'Coincide con categorias que sueles comprar'
            : enPromo
              ? 'Promocion vigente con stock disponible'
              : 'Tendencia de la coleccion actual',
          puntuacion: puntuar(p.id_categoria, enPromo),
          origen: 'MOCK_LOCAL',
          producto: expandirProducto(p),
        }));
    },
  },
];
