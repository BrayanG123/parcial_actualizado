import { Paginacion } from '../../components/ui/Paginacion';
import { Link, useSearchParams } from 'react-router-dom';
import { SIGUIENTES_RESERVA as SIGUIENTES } from '../../lib/reservas';
import { useState } from 'react';
import { BadgeReserva } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Confirmacion } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useCambiarEstadoReserva, useReserva, useReservas } from '../../hooks/useComercio';
import { useSucursales } from '../../hooks/useOperaciones';
import { etiqueta, fechaHora } from '../../lib/format';
import { EstadoReserva } from '../../types/domain';
import '../../styles/notificaciones.css';

const ACCION: Record<string, string> = {
  [EstadoReserva.PREPARANDO]: 'Comenzar preparacion',
  [EstadoReserva.LISTA]: 'Marcar como lista',
  [EstadoReserva.CLIENTE_PRESENTE]: 'Cliente en tienda',
  [EstadoReserva.ATENDIDA]: 'Cerrar atencion',
  [EstadoReserva.CANCELADA]: 'Cancelar',
};

export default function PaginaReservasOperacion() {
  const { idSucursal, tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');

  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState<number | ''>(
    esAdmin ? '' : (idSucursal ?? ''),
  );
  const [confirmacion, setConfirmacion] = useState<{ id: number; estado: EstadoReserva } | null>(
    null,
  );
  // Una notificacion abre la pagina con ?reserva=ID para mostrarla primero.
  const [params, setParams] = useSearchParams();
  const idDestacada = Number(params.get('reserva')) || undefined;

  const sucursales = useSucursales();
  const cambiar = useCambiarEstadoReserva();
  const toast = useToast();
  const destacada = useReserva(idDestacada);

  const consulta = useReservas({
    estado: (estado || undefined) as EstadoReserva | undefined,
    id_sucursal: esAdmin ? sucursalFiltro || undefined : idSucursal || undefined,
    page,
    page_size: 30,
  });
  type Reserva = NonNullable<typeof consulta.data>['items'][number];

  async function aplicar() {
    if (!confirmacion) return;
    try {
      await cambiar.mutateAsync(confirmacion);
      toast.exito('Estado de la reserva actualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos actualizar la reserva.');
    } finally {
      setConfirmacion(null);
    }
  }

  function tarjeta(r: Reserva, resaltada = false) {
    return (
      <article key={r.id_reserva} className={`fs-panel${resaltada ? ' fs-reserva--resaltada' : ''}`}>
        <div className="fs-fila-entre">
          <div>
            <p className="fs-eyebrow">Reserva #{r.id_reserva}</p>
            <h3>{r.cliente?.nombre ?? 'Cliente'}</h3>
            <p className="fs-sub">{r.cliente?.telefono}</p>
          </div>
          <BadgeReserva estado={r.estado} />
        </div>

        <div className="fs-sub">
          {r.sucursal?.nombre} - visita {fechaHora(r.horario_aproximado)}
        </div>

        {r.vence_en && <p className="fs-sub">Limite de presentacion: {fechaHora(r.vence_en)}</p>}
        <hr className="fs-divisor" />

        <ul className="fs-pila" style={{ gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {r.detalles.map((d) => (
            <li key={d.id_detalle_reserva} style={{ fontSize: '0.88rem' }}>
              {d.cantidad} x {d.producto?.nombre}
              <span className="fs-sub">
                {' '}
                - {d.talla?.nombre} / {d.color?.nombre}
              </span>
            </li>
          ))}
        </ul>

        {r.observacion && <p className="fs-sub">Nota: {r.observacion}</p>}

        {r.estado === EstadoReserva.CLIENTE_PRESENTE && (
          <Link className="fs-btn fs-btn--acento" to={`/caja?reserva=${r.id_reserva}&sucursal=${r.id_sucursal}`}>
            Pasar a caja
          </Link>
        )}

        {SIGUIENTES[r.estado].length > 0 && (
          <div className="fs-fila-wrap">
            {SIGUIENTES[r.estado].map((siguiente) => (
              <button
                key={siguiente}
                type="button"
                className={`fs-btn fs-btn--s${
                  siguiente === EstadoReserva.CANCELADA || siguiente === EstadoReserva.VENCIDA
                    ? ' fs-btn--contorno'
                    : ' fs-btn--acento'
                }`}
                disabled={cambiar.isPending}
                onClick={() => setConfirmacion({ id: r.id_reserva, estado: siguiente })}
              >
                {ACCION[siguiente]}
              </button>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Operaciones</p>
          <h1>Reservas</h1>
          <p className="fs-sub">
            Preparacion y atencion de las prendas apartadas por los clientes.
          </p>
        </div>
      </header>

      {idDestacada && (
        <section className="fs-pila">
          <div className="fs-fila-entre">
            <p className="fs-eyebrow">Reserva notificada</p>
            <button
              type="button"
              className="fs-btn fs-btn--fantasma fs-btn--s"
              onClick={() => {
                params.delete('reserva');
                setParams(params, { replace: true });
              }}
            >
              Quitar
            </button>
          </div>
          {destacada.isPending && <FilasSkeleton filas={2} />}
          {destacada.isError && (
            <ErrorEstado error={destacada.error} onReintentar={() => destacada.refetch()} />
          )}
          {destacada.data && <div className="fs-rejilla-3">{tarjeta(destacada.data, true)}</div>}
        </section>
      )}

      <section className="fs-tarjeta fs-tarjeta--pad">
        <div className="fs-fila-wrap">
          <div className="fs-campo" style={{ minWidth: 220 }}>
            <label htmlFor="estado-reserva">Estado</label>
            <select
              id="estado-reserva"
              className="fs-select"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {Object.values(EstadoReserva).map((e) => (
                <option key={e} value={e}>
                  {etiqueta(e)}
                </option>
              ))}
            </select>
          </div>

          {esAdmin && (
            <div className="fs-campo" style={{ minWidth: 220 }}>
              <label htmlFor="sucursal-reservas">Sucursal</label>
              <select
                id="sucursal-reservas"
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
        </div>
      </section>

      {consulta.isPending && <FilasSkeleton filas={4} />}
      {consulta.isError && (
        <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
      )}
      {consulta.data && consulta.data.items.length === 0 && (
        <div className="fs-tarjeta fs-tarjeta--pad">
          <Vacio
            titulo="Sin reservas"
            mensaje="No hay reservas que coincidan con el filtro seleccionado."
          />
        </div>
      )}

      <div className="fs-rejilla-3">
        {consulta.data?.items
          .filter((r) => r.id_reserva !== destacada.data?.id_reserva)
          .map((r) => tarjeta(r))}
      </div>

      {consulta.data && (
        <Paginacion
          page={consulta.data.page}
          pageSize={consulta.data.page_size}
          total={consulta.data.total}
          onCambiar={setPage}
        />
      )}
      <Confirmacion
        abierto={confirmacion !== null}
        titulo="Actualizar reserva"
        mensaje={
          confirmacion
            ? confirmacion.estado === EstadoReserva.ATENDIDA
              ? 'Se cerrara la atencion y se liberaran las prendas que sigan reservadas. Esta accion no registra una venta ni un pago. Confirma al terminar la visita.'
              : `La reserva pasara al estado ${etiqueta(confirmacion.estado)}. Confirmas la operacion?`
            : ''
        }
        textoConfirmar="Actualizar"
        peligro={
          confirmacion?.estado === EstadoReserva.CANCELADA ||
          confirmacion?.estado === EstadoReserva.VENCIDA
        }
        cargando={cambiar.isPending}
        onConfirmar={aplicar}
        onCancelar={() => !cambiar.isPending && setConfirmacion(null)}
      />
    </>
  );
}
