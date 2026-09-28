import { Link } from 'react-router-dom';
import { BadgeStock } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { hoyBolivia, sumarDias } from '../../api/reportes.contratos';
import {
  useReporteInventario,
  useReporteVentas,
  useReservasPorEstado,
  useTopProductos,
} from '../../hooks/useOperaciones';
import { etiqueta, moneda } from '../../lib/format';
import { EstadoReserva } from '../../types/domain';
import { BarraComparativa, GraficoSucursales, GraficoVentas, TarjetaKPI } from '../reports/componentes';

const UMBRAL_CRITICO = 5;
const RESERVAS_ACTIVAS: string[] = [
  EstadoReserva.PENDIENTE,
  EstadoReserva.PREPARANDO,
  EstadoReserva.LISTA,
  EstadoReserva.CLIENTE_PRESENTE,
];

export default function PaginaDashboard() {
  const hoy = hoyBolivia();
  const ventas = useReporteVentas();
  const top = useTopProductos({ limite: 5 });
  const critico = useReporteInventario({ solo_stock_bajo: true, umbral: UMBRAL_CRITICO, page_size: 6 });
  // El reporte filtra por horario de la cita: incluye visitas recientes y proximas.
  const reservas = useReservasPorEstado({ desde: sumarDias(hoy, -30), hasta: sumarDias(hoy, 30) });

  const maxTop = Math.max(1, ...(top.data?.map((t) => t.unidades) ?? [1]));
  const reservasActivas =
    reservas.data?.filter((r) => RESERVAS_ACTIVAS.includes(r.estado)).reduce((a, r) => a + r.cantidad, 0) ?? 0;

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Administracion</p>
          <h1>Dashboard</h1>
          <p className="fs-sub">Vision general de ventas, reservas e inventario de los ultimos 30 dias.</p>
        </div>
        <Link to="/admin/reportes" className="fs-btn fs-btn--contorno fs-btn--s">
          Ver reportes
        </Link>
      </header>

      {ventas.isPending && <FilasSkeleton filas={2} />}
      {ventas.isError && <ErrorEstado error={ventas.error} onReintentar={() => ventas.refetch()} />}
      {ventas.data && (
        <section className="fs-kpis">
          <TarjetaKPI
            etiqueta="Ventas completadas"
            valor={moneda(ventas.data.resumen.monto_total, ventas.data.moneda)}
            detalle={`${ventas.data.desde} al ${ventas.data.hasta}`}
          />
          <TarjetaKPI
            etiqueta="Transacciones"
            valor={String(ventas.data.resumen.cantidad_ventas)}
            detalle={`Ticket promedio ${moneda(ventas.data.resumen.ticket_promedio, ventas.data.moneda)}`}
          />
          <TarjetaKPI etiqueta="Unidades vendidas" valor={String(ventas.data.resumen.unidades_vendidas)} />
          <TarjetaKPI
            etiqueta="Reservas activas"
            valor={reservas.data ? String(reservasActivas) : '-'}
            detalle="Pendientes, preparando, listas o en tienda"
          />
          <TarjetaKPI
            etiqueta="Stock bajo"
            valor={critico.data ? String(critico.data.resumen.stock_bajo) : '-'}
            detalle={
              critico.data
                ? `${critico.data.resumen.agotados} agotadas; ${UMBRAL_CRITICO} o menos disponibles`
                : undefined
            }
          />
        </section>
      )}

      <section className="fs-rejilla-2">
        <article className="fs-panel">
          <h3>Ventas diarias</h3>
          {ventas.isPending && <FilasSkeleton filas={3} />}
          {ventas.data && ventas.data.resumen.cantidad_ventas === 0 && (
            <Vacio titulo="Sin ventas" mensaje="No hay ventas completadas en los ultimos 30 dias." />
          )}
          {ventas.data && ventas.data.resumen.cantidad_ventas > 0 && <GraficoVentas datos={ventas.data.diario} />}
        </article>

        <article className="fs-panel">
          <h3>Productos mas vendidos</h3>
          {top.isPending && <FilasSkeleton filas={4} />}
          {top.isError && <ErrorEstado error={top.error} onReintentar={() => top.refetch()} />}
          {top.data && top.data.length === 0 && <Vacio titulo="Sin ventas" mensaje="Todavia no hay ventas registradas." />}
          {top.data && top.data.length > 0 && (
            <div className="fs-pila">
              {top.data.map((t) => (
                <BarraComparativa
                  key={t.id_producto}
                  etiqueta={t.nombre}
                  valor={t.unidades}
                  maximo={maxTop}
                  detalle={`${t.unidades} u - ${moneda(t.total)}`}
                />
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="fs-rejilla-2">
        <article className="fs-panel">
          <h3>Ventas por sucursal</h3>
          {ventas.isPending && <FilasSkeleton filas={3} />}
          {ventas.data && ventas.data.por_sucursal.length === 0 && (
            <Vacio titulo="Sin datos" mensaje="Ninguna sucursal registro ventas en el periodo." />
          )}
          {ventas.data && ventas.data.por_sucursal.length > 0 && <GraficoSucursales datos={ventas.data.por_sucursal} />}
        </article>

        <article className="fs-panel">
          <h3>Reservas por estado</h3>
          <p className="fs-sub">Citas de los ultimos y proximos 30 dias.</p>
          {reservas.isPending && <FilasSkeleton filas={4} />}
          {reservas.isError && <ErrorEstado error={reservas.error} onReintentar={() => reservas.refetch()} />}
          {reservas.data && (
            <div className="fs-pila" style={{ gap: 8 }}>
              {reservas.data.map((r) => (
                <div key={r.estado} className="fs-fila-entre">
                  <span>{etiqueta(r.estado)}</span>
                  <span className="fs-nums">{r.cantidad}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="fs-panel">
        <div className="fs-fila-entre">
          <h3>Inventario que requiere atencion</h3>
          <Link to="/admin/reportes" className="fs-btn fs-btn--contorno fs-btn--s">
            Ver todo
          </Link>
        </div>
        {critico.isPending && <FilasSkeleton filas={4} />}
        {critico.isError && <ErrorEstado error={critico.error} onReintentar={() => critico.refetch()} />}
        {critico.data && critico.data.items.length === 0 && (
          <Vacio titulo="Stock saludable" mensaje="Ninguna combinacion esta por debajo del umbral critico." />
        )}
        {critico.data && critico.data.items.length > 0 && <TablaInventario filas={critico.data.items} />}
      </section>
    </>
  );
}

export function TablaInventario({
  filas,
}: {
  filas: NonNullable<ReturnType<typeof useReporteInventario>['data']>['items'];
}) {
  return (
    <div className="fs-tabla-scroll">
      <table className="fs-tabla">
        <thead>
          <tr>
            <th>Prenda</th>
            <th>Talla</th>
            <th>Color</th>
            <th>Sucursal</th>
            <th className="fs-tabla-num">Fisico</th>
            <th className="fs-tabla-num">Reservado</th>
            <th className="fs-tabla-num">Por ingresar</th>
            <th>Disponible</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((i) => (
            <tr key={i.id_inventario}>
              <td>
                {i.producto}
                {!i.producto_activo && <span className="fs-sub"> (inactivo)</span>}
              </td>
              <td>{i.talla}</td>
              <td>{i.color}</td>
              <td>{i.sucursal}</td>
              <td className="fs-tabla-num">{i.fisico}</td>
              <td className="fs-tabla-num">{i.reservado}</td>
              <td className="fs-tabla-num">{i.entrante}</td>
              <td>
                <BadgeStock disponible={i.disponible} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
