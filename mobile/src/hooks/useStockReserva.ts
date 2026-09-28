import { useQueries } from '@tanstack/react-query';
import { catalogoService } from '../services/catalogo.service';
import { estadoPrendaReserva } from '../lib/stock-reserva';
import type { LineaBorrador } from '../features/reservations/BorradorReserva';

export function useStockReserva(lineas: LineaBorrador[], idSucursal: number | undefined, habilitado: boolean) {
  const productos = [...new Set(lineas.map((l) => l.id_producto))];
  const consultas = useQueries({
    queries: productos.map((id) => ({
      queryKey: ['disponibilidad', id, { id_sucursal: idSucursal }],
      queryFn: () => catalogoService.disponibilidad({ id_producto: id, id_sucursal: idSucursal }),
      enabled: habilitado && !!idSucursal,
      staleTime: 0,
    })),
  });
  const estados = lineas.map((linea) =>
    estadoPrendaReserva(linea, idSucursal, consultas[productos.indexOf(linea.id_producto)]));
  return {
    estados,
    confirmable: estados.length > 0 && estados.every((e) => e.estado === 'disponible'),
    consultando: estados.some((e) => e.estado === 'consultando'),
    error: estados.some((e) => e.estado === 'error'),
    refrescar: () => Promise.all(consultas.map((c) => c.refetch())),
  };
}
