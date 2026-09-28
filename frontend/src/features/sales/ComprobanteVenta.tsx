import { useQuery } from '@tanstack/react-query';
import { USAR_MOCKS } from '../../api/config';
import { ventasService } from '../../services/ventas.service';
import { EstadoVenta } from '../../types/domain';
import { ErrorEstado } from '../../components/ui/Estados';
import { BadgeCanal, BadgePago, BadgeVenta } from '../../components/ui/Badges';
import { subtotal, totalLineas } from '../../lib/domain';
import { etiqueta, fechaHora, moneda } from '../../lib/format';
import type { Venta } from '../../types/domain';

/** Comprobante reutilizado por cliente, caja y administracion. */
export function ComprobanteVenta({ venta }: { venta: Venta }) {
  const consulta = useQuery({
    queryKey: ['venta', venta.id_venta, 'comprobante'],
    queryFn: () => ventasService.comprobante(venta.id_venta),
    enabled:
      !USAR_MOCKS &&
      (venta.comprobante_disponible ?? venta.estado === EstadoVenta.PAGADA) &&
      !venta.numero_comprobante,
  });
  return (
    <>
      {consulta.isFetching && <p className="fs-no-imprimir">Cargando comprobante...</p>}
      {consulta.isError && (
        <div className="fs-no-imprimir">
          <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
        </div>
      )}
      <ContenidoComprobante venta={consulta.data ?? venta} />
      {(consulta.data?.numero_comprobante || venta.numero_comprobante) && (
        <button
          type="button"
          className="fs-btn fs-btn--contorno fs-no-imprimir"
          onClick={() => window.print()}
        >
          Imprimir comprobante
        </button>
      )}
    </>
  );
}

function ContenidoComprobante({ venta }: { venta: Venta }) {
  const importe = (n: number) => moneda(n, venta.moneda);
  const bruto = totalLineas(
    venta.detalles.map((d) => ({ cantidad: d.cantidad, precio_unitario: d.precio_unitario })),
  );
  const descuentos = venta.detalles.reduce((acc, d) => acc + d.descuento, 0);

  return (
    <div className="fs-pila fs-comprobante">
      <div className="fs-fila-entre">
        <div>
          <p className="fs-eyebrow">{venta.comprobante_disponible === false ? 'Detalle del pedido' : 'Comprobante'}</p>
          <h2>{venta.numero_comprobante ?? `Venta #${venta.id_venta}`}</h2>
          <p className="fs-sub">{fechaHora(venta.fecha)}</p>
        </div>
        <div className="fs-fila" style={{ gap: 8 }}>
          <BadgeCanal canal={venta.canal} />
          <BadgeVenta estado={venta.estado} />
        </div>
      </div>

      <div className="fs-rejilla-form">
        <div>
          <p className="fs-eyebrow">Cliente</p>
          <p>{venta.cliente?.nombre ?? 'Consumidor final'}</p>
        </div>
        <div>
          <p className="fs-eyebrow">Sucursal</p>
          <p>{venta.sucursal?.nombre ?? '-'}</p>
        </div>
      </div>

      {venta.id_turno && <p>Turno de caja #{venta.id_turno}</p>}
      {venta.cajero && <p>Cajero: {venta.cajero}</p>}
      {venta.id_reserva && <p>Reserva #{venta.id_reserva}</p>}
      <div className="fs-tabla-scroll">
        <table className="fs-tabla">
          <thead>
            <tr>
              <th>Prenda</th>
              <th>Talla</th>
              <th>Color</th>
              <th className="fs-tabla-num">Cant.</th>
              <th className="fs-tabla-num">P. unitario</th>
              <th className="fs-tabla-num">Descuento</th>
              <th className="fs-tabla-num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {venta.detalles.map((d) => (
              <tr key={d.id_detalle_venta}>
                <td>{d.producto?.nombre ?? `Producto ${d.id_producto}`}</td>
                <td>{d.talla?.nombre}</td>
                <td>{d.color?.nombre}</td>
                <td className="fs-tabla-num">{d.cantidad}</td>
                <td className="fs-tabla-num">{importe(d.precio_unitario)}</td>
                <td className="fs-tabla-num">
                  {d.descuento > 0 ? `- ${importe(d.descuento)}` : '-'}
                </td>
                <td className="fs-tabla-num">
                  {importe(subtotal(d.cantidad, d.precio_unitario, d.descuento))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginLeft: 'auto', minWidth: 240 }} className="fs-pila">
        <div className="fs-resumen__linea">
          <span>Subtotal</span>
          <span className="fs-nums">{importe(bruto)}</span>
        </div>
        {descuentos > 0 && (
          <div className="fs-resumen__linea">
            <span>Descuentos</span>
            <span className="fs-nums">- {importe(descuentos)}</span>
          </div>
        )}
        <div className="fs-resumen__total">
          <span>Total</span>
          <span className="fs-nums">{importe(venta.total)}</span>
        </div>
      </div>

      <div className="fs-pila" style={{ gap: 8 }}>
        <p className="fs-eyebrow">Pagos</p>
        {venta.pagos.map((p) => (
          <div key={p.id_pago} className="fs-fila-entre">
            <span>
              {etiqueta(p.metodo)} <span className="fs-sub">({etiqueta(p.tipo)})</span>
            </span>
            <div className="fs-fila" style={{ gap: 10 }}>
              <span className="fs-nums">{importe(p.monto)}</span>
              <BadgePago estado={p.estado} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
