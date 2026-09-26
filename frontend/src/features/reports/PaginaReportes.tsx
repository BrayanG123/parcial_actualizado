import { BotonesExportar } from './BotonesExportar';
import { cargarReporteGeneral } from './datos-exportacion';
import { useMemo, useState } from 'react';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Paginacion } from '../../components/ui/Paginacion';
import { hoyBolivia, sumarDias } from '../../api/reportes.contratos';
import { useAuth } from '../../context/AuthContext';
import {
  useReporteCaja,
  useReporteInventario,
  useReporteVentas,
  useReservasPorEstado,
  useSucursales,
  useTopProductos,
} from '../../hooks/useOperaciones';
import { etiqueta, fechaHora, moneda } from '../../lib/format';
import { CanalVenta } from '../../types/domain';
import type { FiltroReporte } from '../../types/reportes';
import { TablaInventario } from '../admin/PaginaDashboard';
import { BarraComparativa, GraficoHoras, GraficoSucursales, GraficoVentas, TarjetaKPI } from './componentes';

const TAMANO_INVENTARIO = 10;

export default function PaginaReportes() {
  const { tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');
  const hoy = hoyBolivia();
  const [desde, setDesde] = useState(sumarDias(hoy, -29));
  const [hasta, setHasta] = useState(hoy);
  const [idSucursal, setIdSucursal] = useState<number | ''>('');
  const [canal, setCanal] = useState<CanalVenta | ''>('');
  const [umbral, setUmbral] = useState(5);
  const [soloBajo, setSoloBajo] = useState(true);
  const [pagina, setPagina] = useState(1);

  // El encargado no elige sucursal: NestJS aplica la suya.
  const sucursalFiltro = esAdmin ? idSucursal || undefined : undefined;
  const filtros = useMemo<FiltroReporte>(
    () => ({ desde, hasta, id_sucursal: sucursalFiltro, canal: canal || undefined }),
    [desde, hasta, sucursalFiltro, canal],
  );

  const sucursales = useSucursales();
  const ventas = useReporteVentas(filtros);
  const top = useTopProductos({ ...filtros, limite: 8 });
  const reservas = useReservasPorEstado(filtros);
  const inventario = useReporteInventario({
    id_sucursal: sucursalFiltro,
    umbral,
    solo_stock_bajo: soloBajo,
    page: pagina,
    page_size: TAMANO_INVENTARIO,
  });

  const caja = useReporteCaja({ desde, hasta, id_sucursal: sucursalFiltro });
  const maxTop = Math.max(1, ...(top.data?.map((t) => t.unidades) ?? [1]));
  const totalReservas = reservas.data?.reduce((acc, r) => acc + r.cantidad, 0) ?? 0;
  const mon = ventas.data?.moneda ?? 'BOB';

  function reiniciar() {
    setDesde(sumarDias(hoy, -29));
    setHasta(hoy);
    setIdSucursal('');
    setCanal('');
    setPagina(1);
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">{esAdmin ? 'Administracion' : 'Mi sucursal'}</p>
          <h1>Reportes</h1>
          <p className="fs-sub">
            Ventas completadas, reservas e inventario calculados por el servidor
            {esAdmin ? '.' : ' para tu sucursal.'}
          </p>
        </div>
        <BotonesExportar cargar={() => cargarReporteGeneral(filtros, {
          id_sucursal: sucursalFiltro, umbral, solo_stock_bajo: soloBajo,
        }, esAdmin ? idSucursal ? sucursales.data?.find((s) => s.id_sucursal === idSucursal)?.nombre ?? ('Sucursal ' + idSucursal)
          : 'Todas las autorizadas' : 'Sucursal asignada al encargado')} />
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad">
        <div className="fs-fila-wrap">
          <div className="fs-campo">
            <label htmlFor="desde">Desde</label>
            <input id="desde" type="date" className="fs-input" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="fs-campo">
            <label htmlFor="hasta">Hasta</label>
            <input id="hasta" type="date" className="fs-input" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {esAdmin && (
            <div className="fs-campo" style={{ minWidth: 220 }}>
              <label htmlFor="sucursal-reporte">Sucursal</label>
              <select
                id="sucursal-reporte"
                className="fs-select"
                value={idSucursal}
                onChange={(e) => {
                  setIdSucursal(e.target.value ? Number(e.target.value) : '');
                  setPagina(1);
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
          <div className="fs-campo" style={{ minWidth: 160 }}>
            <label htmlFor="canal-reporte">Canal</label>
            <select
              id="canal-reporte"
              className="fs-select"
              value={canal}
              onChange={(e) => setCanal(e.target.value as CanalVenta | '')}
            >
              <option value="">Todos</option>
              {Object.values(CanalVenta).map((c) => (
                <option key={c} value={c}>
                  {etiqueta(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="fs-fila" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="fs-btn fs-btn--contorno fs-btn--s" onClick={reiniciar}>
              Reiniciar filtros
            </button>
          </div>
        </div>
      </section>

      {ventas.isPending && <FilasSkeleton filas={2} />}
      {ventas.isError && <ErrorEstado error={ventas.error} onReintentar={() => ventas.refetch()} />}
      {ventas.data && (
        <>
          <section className="fs-kpis">
            <TarjetaKPI etiqueta="Monto vendido" valor={moneda(ventas.data.resumen.monto_total, mon)} />
            <TarjetaKPI etiqueta="Ventas" valor={String(ventas.data.resumen.cantidad_ventas)} />
            <TarjetaKPI etiqueta="Ticket promedio" valor={moneda(ventas.data.resumen.ticket_promedio, mon)} />
            <TarjetaKPI etiqueta="Unidades" valor={String(ventas.data.resumen.unidades_vendidas)} />
            <TarjetaKPI etiqueta="Reservas en el periodo" valor={String(totalReservas)} detalle="Por fecha de la cita" />
          </section>
          {ventas.data.otras_monedas.length > 0 && (
            <p className="fs-sub">
              Tambien hubo ventas en {ventas.data.otras_monedas.join(', ')}; no se suman a los importes en {mon}.
            </p>
          )}
        </>
      )}

      <section className="fs-panel">
        <h3>Evolucion de ventas</h3>
        {ventas.isPending && <FilasSkeleton filas={3} />}
        {ventas.data && ventas.data.resumen.cantidad_ventas === 0 && (
          <Vacio titulo="Sin ventas en el periodo" mensaje="Ajusta el rango de fechas, el canal o la sucursal." />
        )}
        {ventas.data && ventas.data.resumen.cantidad_ventas > 0 && <GraficoVentas datos={ventas.data.diario} />}
      </section>

      {ventas.data && ventas.data.resumen.cantidad_ventas > 0 && (
        <section className="fs-panel">
          <h3>Ventas por hora</h3>
          <p className="fs-sub">Suma del periodo por hora de confirmacion (hora de Bolivia).</p>
          <GraficoHoras datos={ventas.data.por_hora} />
        </section>
      )}

      <section className="fs-rejilla-2">
        <article className="fs-panel">
          <h3>Comparativo por sucursal</h3>
          {ventas.data && ventas.data.por_sucursal.length > 0 && (
            <>
              <GraficoSucursales datos={ventas.data.por_sucursal} />
              <div className="fs-tabla-scroll">
                <table className="fs-tabla">
                  <thead>
                    <tr>
                      <th>Sucursal</th>
                      <th className="fs-tabla-num">Ventas</th>
                      <th className="fs-tabla-num">Unidades</th>
                      <th className="fs-tabla-num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.data.por_sucursal.map((s) => (
                      <tr key={s.id_sucursal ?? 'sin-sucursal'}>
                        <td>{s.sucursal}</td>
                        <td className="fs-tabla-num">{s.cantidad}</td>
                        <td className="fs-tabla-num">{s.unidades}</td>
                        <td className="fs-tabla-num">{moneda(s.total, mon)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {ventas.data && ventas.data.por_sucursal.length === 0 && (
            <Vacio titulo="Sin datos" mensaje="No hubo ventas en el periodo elegido." />
          )}
        </article>

        <article className="fs-panel">
          <h3>Ventas por canal</h3>
          {ventas.data && ventas.data.por_canal.length === 0 && (
            <Vacio titulo="Sin datos" mensaje="No hubo ventas en el periodo elegido." />
          )}
          {ventas.data && ventas.data.por_canal.length > 0 && (
            <div className="fs-pila">
              {ventas.data.por_canal.map((c) => (
                <BarraComparativa
                  key={c.canal}
                  etiqueta={etiqueta(c.canal)}
                  valor={c.total}
                  maximo={ventas.data.resumen.monto_total}
                  detalle={`${c.cantidad} ventas - ${moneda(c.total, mon)}`}
                />
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="fs-rejilla-2">
        <article className="fs-panel">
          <h3>Ranking de prendas</h3>
          {top.isPending && <FilasSkeleton filas={5} />}
          {top.isError && <ErrorEstado error={top.error} onReintentar={() => top.refetch()} />}
          {top.data && top.data.length === 0 && (
            <Vacio titulo="Sin datos" mensaje="No hubo ventas de prendas en el periodo elegido." />
          )}
          {top.data && top.data.length > 0 && (
            <div className="fs-pila">
              {top.data.map((t) => (
                <BarraComparativa
                  key={t.id_producto}
                  etiqueta={`${t.posicion}. ${t.nombre}`}
                  valor={t.unidades}
                  maximo={maxTop}
                  detalle={`${t.unidades} u - ${moneda(t.total)}`}
                />
              ))}
            </div>
          )}
        </article>

        <article className="fs-panel">
          <h3>Estado de las reservas</h3>
          <p className="fs-sub">Segun el horario de la cita dentro del periodo.</p>
          {reservas.isPending && <FilasSkeleton filas={3} />}
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
        <h3>Cajas y turnos</h3>
        <p className="fs-sub">Turnos abiertos en el periodo. No depende del filtro de canal.</p>
        {caja.isPending && <FilasSkeleton filas={3} />}
        {caja.isError && <ErrorEstado error={caja.error} onReintentar={() => caja.refetch()} />}
        {caja.data && caja.data.resumen.turnos === 0 && (
          <Vacio titulo="Sin turnos" mensaje="No se abrieron turnos de caja en el periodo." />
        )}
        {caja.data && caja.data.resumen.turnos > 0 && (
          <>
            <div className="fs-kpis">
              <TarjetaKPI
                etiqueta="Turnos"
                valor={String(caja.data.resumen.turnos)}
                detalle={`${caja.data.resumen.turnos_abiertos} abiertos - ${caja.data.resumen.ventas} ventas`}
              />
              <TarjetaKPI etiqueta="Cobrado en caja" valor={moneda(caja.data.resumen.total, caja.data.moneda)} />
              <TarjetaKPI
                etiqueta="Efectivo / Tarjeta"
                valor={moneda(caja.data.resumen.efectivo, caja.data.moneda)}
                detalle={`Tarjeta ${moneda(caja.data.resumen.tarjeta, caja.data.moneda)} - QR ${moneda(caja.data.resumen.qr, caja.data.moneda)} - Transf. ${moneda(caja.data.resumen.transferencia, caja.data.moneda)}`}
              />
              <TarjetaKPI
                etiqueta="Diferencia de arqueo"
                valor={moneda(caja.data.resumen.diferencia, caja.data.moneda)}
                detalle={`${caja.data.resumen.turnos_con_diferencia} turnos con faltante o sobrante`}
              />
            </div>
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Sucursal</th>
                    <th className="fs-tabla-num">Turnos</th>
                    <th className="fs-tabla-num">Ventas</th>
                    <th className="fs-tabla-num">Efectivo</th>
                    <th className="fs-tabla-num">Otros medios</th>
                    <th className="fs-tabla-num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {caja.data.por_caja.map((c) => (
                    <tr key={c.id_caja}>
                      <td>{c.caja}</td>
                      <td>{c.sucursal}</td>
                      <td className="fs-tabla-num">{c.turnos}</td>
                      <td className="fs-tabla-num">{c.ventas}</td>
                      <td className="fs-tabla-num">{moneda(c.efectivo, caja.data!.moneda)}</td>
                      <td className="fs-tabla-num">{moneda(c.tarjeta + c.qr + c.transferencia, caja.data!.moneda)}</td>
                      <td className="fs-tabla-num">{moneda(c.diferencia, caja.data!.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Cajero</th>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th className="fs-tabla-num">Total</th>
                    <th className="fs-tabla-num">Esperado</th>
                    <th className="fs-tabla-num">Contado</th>
                    <th className="fs-tabla-num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {caja.data.turnos.slice(0, 20).map((t) => (
                    <tr key={t.id_turno}>
                      <td>
                        #{t.id_turno} - {t.caja}
                      </td>
                      <td>{t.cajero}</td>
                      <td>{fechaHora(t.apertura)}</td>
                      <td>{t.cierre ? fechaHora(t.cierre) : 'Abierto'}</td>
                      <td className="fs-tabla-num">{moneda(t.total, t.moneda)}</td>
                      <td className="fs-tabla-num">{moneda(t.efectivo_esperado, t.moneda)}</td>
                      <td className="fs-tabla-num">{t.efectivo_contado == null ? '-' : moneda(t.efectivo_contado, t.moneda)}</td>
                      <td className="fs-tabla-num">{t.diferencia == null ? '-' : moneda(t.diferencia, t.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="fs-panel">
        <div className="fs-fila-entre fs-fila-wrap">
          <h3>Inventario actual</h3>
          <div className="fs-fila-wrap">
            <label className="fs-fila" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={soloBajo}
                onChange={(e) => {
                  setSoloBajo(e.target.checked);
                  setPagina(1);
                }}
              />
              Solo stock bajo
            </label>
            <div className="fs-campo" style={{ maxWidth: 140 }}>
              <label htmlFor="umbral">Umbral</label>
              <input
                id="umbral"
                type="number"
                min={0}
                className="fs-input"
                value={umbral}
                onChange={(e) => {
                  setUmbral(Math.max(0, Number(e.target.value) || 0));
                  setPagina(1);
                }}
              />
            </div>
          </div>
        </div>
        {inventario.isPending && <FilasSkeleton filas={4} />}
        {inventario.isError && <ErrorEstado error={inventario.error} onReintentar={() => inventario.refetch()} />}
        {inventario.data && (
          <>
            <p className="fs-sub">
              {inventario.data.resumen.variantes} variantes - {inventario.data.resumen.disponible} disponibles,{' '}
              {inventario.data.resumen.reservado} reservadas, {inventario.data.resumen.entrante} por ingresar,{' '}
              {inventario.data.resumen.agotados} agotadas.
            </p>
            {inventario.data.items.length === 0 ? (
              <Vacio titulo="Sin resultados" mensaje="Ninguna variante coincide con el filtro." />
            ) : (
              <TablaInventario filas={inventario.data.items} />
            )}
            <Paginacion
              page={inventario.data.page}
              pageSize={inventario.data.page_size}
              total={inventario.data.total}
              onCambiar={setPagina}
            />
          </>
        )}
      </section>
    </>
  );
}
