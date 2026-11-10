import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeVenta } from '../../components/ui/Badges';
import { ErrorEstado, Vacio } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { Paginacion } from '../../components/ui/Paginacion';
import { etiqueta, fechaHora, moneda } from '../../lib/format';
import { posService } from '../../services/pos.service';
import type { Venta } from '../../types/domain';
import { ComprobanteVenta } from '../sales/ComprobanteVenta';
import '../../styles/landing.css';

const METODO: Record<string, string> = {
  CASH: 'Efectivo',
  EFECTIVO: 'Efectivo',
  CARD: 'Tarjeta',
  TARJETA: 'Tarjeta',
  QR: 'QR',
  BANK_TRANSFER: 'Transferencia',
  TRANSFERENCIA: 'Transferencia',
};

/** Ventas del cajero: las de la caja abierta o todo su historial. */
export function HistorialCaja({ userId, shiftId }: { userId: number; shiftId: number }) {
  const [alcance, setAlcance] = useState<'turno' | 'todas'>('turno');
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const ventas = useQuery({
    queryKey: ['ventas', 'caja', userId, alcance, shiftId, page],
    queryFn: () => posService.historial(page, alcance === 'turno' ? shiftId : undefined),
  });
  return (
    <div className="fs-pila">
      <div className="fs-fila-entre">
        <div className="fs-segmento" role="tablist" aria-label="Alcance del historial">
          {(
            [
              ['turno', 'Esta caja'],
              ['todas', 'Todas mis ventas'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={alcance === valor}
              className={`fs-segmento__opcion${alcance === valor ? ' fs-segmento__opcion--activa' : ''}`}
              onClick={() => {
                setAlcance(valor);
                setPage(1);
              }}
            >
              {texto}
            </button>
          ))}
        </div>
        <button type="button" className="fs-btn fs-btn--fantasma" onClick={() => ventas.refetch()}>
          Actualizar
        </button>
      </div>
      {ventas.isPending && <p>Cargando ventas...</p>}
      {ventas.isError && <ErrorEstado error={ventas.error} onReintentar={() => ventas.refetch()} />}
      {ventas.data && ventas.data.items.length === 0 && (
        <Vacio
          titulo="Sin ventas todavia"
          mensaje={
            alcance === 'turno'
              ? 'Las ventas que registres en esta caja apareceran aqui.'
              : 'Aun no registraste ventas.'
          }
        />
      )}
      {ventas.data && ventas.data.items.length > 0 && (
        <div className="fs-tabla-scroll">
          <table className="fs-tabla">
            <thead>
              <tr>
                <th>Comprobante</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Prendas</th>
                <th>Pago</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ventas.data.items.map((v) => (
                <tr key={v.id_venta}>
                  <td>
                    {v.numero_comprobante ?? `FS-${String(v.id_venta).padStart(8, '0')}`}
                  </td>
                  <td>{fechaHora(v.fecha)}</td>
                  <td>{v.cliente?.nombre ?? 'Consumidor final'}</td>
                  <td>{v.detalles.reduce((s, d) => s + d.cantidad, 0)}</td>
                  <td>
                    {v.pagos.map((p) => METODO[p.metodo] ?? etiqueta(p.metodo)).join(', ') || '—'}
                  </td>
                  <td>
                    <BadgeVenta estado={v.estado} />
                  </td>
                  <td style={{ textAlign: 'right' }}>{moneda(v.total, v.moneda)}</td>
                  <td>
                    <button
                      type="button"
                      className="fs-btn fs-btn--fantasma"
                      onClick={() => setDetalle(v)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ventas.data && (
        <Paginacion
          page={page}
          pageSize={10}
          total={ventas.data.total}
          onCambiar={setPage}
        />
      )}
      <Modal
        abierto={Boolean(detalle)}
        titulo="Comprobante de venta"
        ancho
        onCerrar={() => setDetalle(null)}
      >
        {detalle && <ComprobanteVenta venta={detalle} />}
      </Modal>
    </div>
  );
}
