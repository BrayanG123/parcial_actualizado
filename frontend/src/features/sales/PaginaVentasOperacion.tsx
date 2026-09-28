import { useState } from 'react';
import { BadgeCanal, BadgeVenta } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { Paginacion } from '../../components/ui/Paginacion';
import { useAuth } from '../../context/AuthContext';
import { useVentas } from '../../hooks/useComercio';
import { useSucursales } from '../../hooks/useOperaciones';
import { etiqueta, fechaHora, moneda } from '../../lib/format';
import { CanalVenta, type Venta } from '../../types/domain';
import { ComprobanteVenta } from './ComprobanteVenta';
import { USAR_MOCKS } from '../../api/config';
import DetallePedido from '../checkout/DetallePedido';

export default function PaginaVentasOperacion() {
  const { idSucursal, tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');

  const [canal, setCanal] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState<number | ''>(
    esAdmin ? '' : (idSucursal ?? ''),
  );
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState<Venta | null>(null);

  const sucursales = useSucursales();
  const consulta = useVentas({
    canal: (canal || undefined) as CanalVenta | undefined,
    id_sucursal: sucursalFiltro || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    page,
    page_size: 15,
  });

  const totales = Object.entries(
    (consulta.data?.items ?? [])
      .filter((v) => v.estado === 'PAGADA')
      .reduce<Record<string, number>>(
        (acc, v) => ({ ...acc, [v.moneda ?? 'BOB']: (acc[v.moneda ?? 'BOB'] ?? 0) + v.total }),
        {},
      ),
  );

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Operaciones</p>
          <h1>Ventas</h1>
          <p className="fs-sub">Historial de ventas web, movil y presenciales.</p>
        </div>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <div className="fs-fila-wrap">
          <div className="fs-campo" style={{ minWidth: 180 }}>
            <label htmlFor="canal-venta">Canal</label>
            <select
              id="canal-venta"
              className="fs-select"
              value={canal}
              onChange={(e) => {
                setCanal(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {Object.values(CanalVenta).map((c) => (
                <option key={c} value={c}>
                  {etiqueta(c)}
                </option>
              ))}
            </select>
          </div>

          {esAdmin && (
            <div className="fs-campo" style={{ minWidth: 200 }}>
              <label htmlFor="sucursal-ventas">Sucursal</label>
              <select
                id="sucursal-ventas"
                className="fs-select"
                value={sucursalFiltro}
                onChange={(e) => {
                  setSucursalFiltro(e.target.value ? Number(e.target.value) : '');
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {sucursales.data?.map((s) => (
                  <option key={s.id_sucursal} value={s.id_sucursal}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="fs-campo">
            <label htmlFor="desde-venta">Desde</label>
            <input
              id="desde-venta"
              type="date"
              className="fs-input"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="fs-campo">
            <label htmlFor="hasta-venta">Hasta</label>
            <input
              id="hasta-venta"
              type="date"
              className="fs-input"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {consulta.isPending && <FilasSkeleton filas={6} />}
        {consulta.isError && (
          <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
        )}
        {consulta.data && consulta.data.items.length === 0 && (
          <Vacio titulo="Sin ventas" mensaje="No hay ventas registradas para esos filtros." />
        )}

        {consulta.data && consulta.data.items.length > 0 && (
          <>
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Sucursal</th>
                    <th>Canal</th>
                    <th>Estado</th>
                    <th className="fs-tabla-num">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.items.map((v) => (
                    <tr key={v.id_venta}>
                      <td>#{v.id_venta}</td>
                      <td>{fechaHora(v.fecha)}</td>
                      <td>
                        {v.cliente?.nombre ?? <span className="fs-sub">Consumidor final</span>}
                      </td>
                      <td>{v.sucursal?.nombre ?? '-'}</td>
                      <td>
                        <BadgeCanal canal={v.canal} />
                      </td>
                      <td>
                        <BadgeVenta estado={v.estado} />
                        {v.contra_entrega && <span className="fs-sub"> · Contra entrega</span>}
                      </td>
                      <td className="fs-tabla-num">{moneda(v.total, v.moneda)}</td>
                      <td className="fs-td-acciones">
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno fs-btn--s"
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

            <div className="fs-fila-entre">
              <span className="fs-sub">Ventas pagadas de la pagina</span>
              <strong className="fs-nums">
                {totales.length
                  ? totales.map(([codigo, total]) => moneda(total, codigo)).join(' / ')
                  : moneda(0)}
              </strong>
            </div>

            <Paginacion
              page={consulta.data.page}
              pageSize={consulta.data.page_size}
              total={consulta.data.total}
              onCambiar={setPage}
            />
          </>
        )}
      </section>

      <Modal
        abierto={detalle !== null}
        titulo={`Venta #${detalle?.id_venta ?? ''}`}
        onCerrar={() => setDetalle(null)}
        ancho
      >
        {detalle && (USAR_MOCKS ? <ComprobanteVenta venta={detalle} /> : <DetallePedido id={detalle.id_venta} operacion />)}
      </Modal>
    </>
  );
}
