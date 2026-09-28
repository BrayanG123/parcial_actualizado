import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Paginacion } from '../../components/ui/Paginacion';
import { BadgeCanal, BadgeVenta } from '../../components/ui/Badges';
import { Cargando, ErrorEstado, Vacio } from '../../components/ui/Estados';
import { useMisCompras } from '../../hooks/useComercio';
import { fecha, moneda } from '../../lib/format';

export default function PaginaMisCompras() {
  const [page, setPage] = useState(1);
  const consulta = useMisCompras({ page, page_size: 20 });

  if (consulta.isPending) return <Cargando texto="Cargando tus compras..." />;
  if (consulta.isError)
    return <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />;

  const ventas = consulta.data?.items ?? [];

  return (
    <div className="fs-contenedor" style={{ paddingTop: 32 }}>
      <div className="fs-seccion__cabecera">
        <div>
          <p className="fs-eyebrow">Mi cuenta</p>
          <h1>Mis compras</h1>
        </div>
      </div>

      {ventas.length === 0 ? (
        <Vacio
          titulo="Todavia no tienes compras"
          mensaje="Cuando realices tu primera compra la veras aqui con su comprobante."
          accion={
            <Link to="/catalogo" className="fs-btn fs-btn--acento">
              Ir al catalogo
            </Link>
          }
        />
      ) : (
        <div className="fs-tarjeta fs-tabla-scroll">
          <table className="fs-tabla">
            <thead>
              <tr>
                <th>Compra</th>
                <th>Fecha</th>
                <th>Canal</th>
                <th>Prendas</th>
                <th>Estado</th>
                <th className="fs-tabla-num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id_venta}>
                  <td>#{v.id_venta}</td>
                  <td>{fecha(v.fecha)}</td>
                  <td>
                    <BadgeCanal canal={v.canal} />
                  </td>
                  <td>{v.detalles.reduce((acc, d) => acc + d.cantidad, 0)}</td>
                  <td>
                    <BadgeVenta estado={v.estado} />
                    {v.contra_entrega && <span className="fs-sub"> · Contra entrega</span>}
                  </td>
                  <td className="fs-tabla-num">{moneda(v.total, v.moneda)}</td>
                  <td className="fs-td-acciones">
                    <Link
                      to={`/mis-compras/${v.id_venta}`}
                      className="fs-btn fs-btn--contorno fs-btn--s"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {consulta.data && (
        <Paginacion page={page} pageSize={20} total={consulta.data.total} onCambiar={setPage} />
      )}
    </div>
  );
}
