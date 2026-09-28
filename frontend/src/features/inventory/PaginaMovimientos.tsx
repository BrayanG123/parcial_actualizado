import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Confirmacion } from '../../components/ui/Modal';
import { Paginacion } from '../../components/ui/Paginacion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useMovimientos,
  useRegistroInventario,
  useCompletarEntrada,
} from '../../hooks/useOperaciones';
import { etiqueta, fechaHora } from '../../lib/format';
import { TipoMovimiento, type MovimientoInventario } from '../../types/domain';
import type { FiltrosMovimiento } from '../../services/inventario.service';

export default function PaginaMovimientos() {
  const [params] = useSearchParams();
  const valor = Number(params.get('id_inventario'));
  const id = Number.isInteger(valor) && valor > 0 ? valor : 0;
  const { tieneRol } = useAuth();
  const rutaInventario = tieneRol('ADMINISTRADOR') ? '/admin/inventario' : '/sucursal/inventario';
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('');
  const [estado, setEstado] = useState<FiltrosMovimiento['estado']>();
  const [page, setPage] = useState(1);
  const [porCompletar, setPorCompletar] = useState<MovimientoInventario | null>(null);
  const registro = useRegistroInventario(id);
  const consulta = useMovimientos({ id_inventario: id, tipo: tipo || undefined, estado, page });
  const completar = useCompletarEntrada();
  const toast = useToast();
  async function confirmar() {
    if (!porCompletar) return;
    try {
      await completar.mutateAsync(porCompletar.id_movimiento);
      toast.exito('Recepcion confirmada. Stock fisico actualizado.');
      setPorCompletar(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pudimos confirmar la recepcion.');
    }
  }
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Operaciones</p>
          <h1>Movimientos de inventario</h1>
          <p className="fs-sub">Historial de una prenda, talla y color en una sucursal.</p>
        </div>
        <Link className="fs-btn fs-btn--contorno" to={rutaInventario}>
          Ir al inventario
        </Link>
      </header>
      {!id ? (
        <Vacio
          titulo="Selecciona un registro de inventario"
          mensaje="En Inventario, abre Movimientos junto a la variante que quieras consultar."
          accion={
            <Link className="fs-btn fs-btn--acento" to={rutaInventario}>
              Seleccionar inventario
            </Link>
          }
        />
      ) : (
        <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
          {registro.isError && (
            <ErrorEstado error={registro.error} onReintentar={() => registro.refetch()} />
          )}
          {registro.data && (
            <p>
              {registro.data.producto?.nombre} · {registro.data.talla?.nombre} ·{' '}
              {registro.data.color?.nombre} · {registro.data.sucursal?.nombre}. Fisico:{' '}
              {registro.data.cantidad_fisica}; reservado: {registro.data.cantidad_reservada}.
            </p>
          )}
          <div className="fs-fila-wrap">
            <div className="fs-campo">
              <label htmlFor="tipo-filtro">Tipo</label>
              <select
                id="tipo-filtro"
                className="fs-select"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as TipoMovimiento | '');
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {Object.values(TipoMovimiento).map((t) => (
                  <option key={t} value={t}>
                    {etiqueta(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="fs-campo">
              <label htmlFor="estado-filtro">Estado</label>
              <select
                id="estado-filtro"
                className="fs-select"
                value={estado ?? ''}
                onChange={(e) => {
                  setEstado((e.target.value as FiltrosMovimiento['estado']) || undefined);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="COMPLETADO">Completado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </div>
          {consulta.isPending && <FilasSkeleton />}
          {consulta.isError && (
            <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
          )}
          {consulta.data?.total === 0 && (
            <Vacio
              titulo="Sin movimientos"
              mensaje="No hay movimientos para los filtros seleccionados."
            />
          )}
          {consulta.data && consulta.data.items.length > 0 && (
            <>
              <div className="fs-tabla-scroll">
                <table className="fs-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="fs-tabla-num">Unidades</th>
                      <th>Referencia / motivo</th>
                      <th>Estado</th>
                      <th>Responsable</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {consulta.data.items.map((m) => (
                      <tr key={m.id_movimiento}>
                        <td>
                          {fechaHora(m.fecha)}
                          {m.fecha_programada && (
                            <div className="fs-sub">Previsto: {fechaHora(m.fecha_programada)}</div>
                          )}
                        </td>
                        <td>{etiqueta(m.tipo)}</td>
                        <td className="fs-tabla-num">{m.cantidad}</td>
                        <td>
                          {m.referencia || '-'}
                          <div className="fs-sub">{m.observacion}</div>
                        </td>
                        <td>
                          <span
                            className={`fs-badge${m.estado === 'PENDIENTE' ? ' fs-badge--alerta' : ''}`}
                          >
                            {etiqueta(m.estado)}
                          </span>
                        </td>
                        <td>{m.empleado?.nombre ?? 'No registrado'}</td>
                        <td>
                          {m.estado === 'PENDIENTE' &&
                            m.tipo === TipoMovimiento.INGRESO_PENDIENTE && (
                              <button
                                type="button"
                                className="fs-btn fs-btn--contorno fs-btn--s"
                                disabled={completar.isPending}
                                onClick={() => setPorCompletar(m)}
                              >
                                Confirmar recepcion
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
      )}
      <Confirmacion
        abierto={porCompletar !== null}
        titulo="Confirmar recepcion de mercaderia"
        mensaje={`Se sumaran ${porCompletar?.cantidad ?? 0} unidades al stock fisico. Confirma cuando hayas recibido la mercaderia.`}
        textoConfirmar="Mercaderia recibida"
        cargando={completar.isPending}
        onConfirmar={confirmar}
        onCancelar={() => !completar.isPending && setPorCompletar(null)}
      />
    </>
  );
}
