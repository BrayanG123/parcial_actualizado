import { useAuth } from '../../context/AuthContext';
import { Paginacion } from '../../components/ui/Paginacion';
import { CANCELABLES_CLIENTE } from '../../lib/reservas';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeReserva } from '../../components/ui/Badges';
import { Cargando, ErrorEstado, Vacio } from '../../components/ui/Estados';
import { Confirmacion } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useCancelarReserva, useMisReservas, useReserva } from '../../hooks/useComercio';
import { fechaHora } from '../../lib/format';

export default function PaginaMisReservas() {
  const { idCliente } = useAuth();
  const [page, setPage] = useState(1);
  const consulta = useMisReservas({ page, page_size: 10 });
  const cancelar = useCancelarReserva();
  const toast = useToast();
  const [params] = useSearchParams();
  const idDestacada = Number(params.get('destacada'));
  const destacada = Number.isInteger(idDestacada) && idDestacada > 0 ? idDestacada : null;
  const reciente = useReserva(
    destacada && !consulta.data?.items.some((r) => r.id_reserva === destacada)
      ? destacada
      : undefined,
  );
  const [porCancelar, setPorCancelar] = useState<number | null>(null);

  if (consulta.isPending) return <Cargando texto="Cargando tus reservas..." />;
  if (consulta.isError)
    return <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />;

  const reservas = [
    ...(reciente.data &&
    reciente.data.id_cliente === idCliente &&
    !consulta.data?.items.some((r) => r.id_reserva === reciente.data.id_reserva)
      ? [reciente.data]
      : []),
    ...(consulta.data?.items ?? []),
  ];

  async function confirmarCancelacion() {
    if (!porCancelar) return;
    try {
      await cancelar.mutateAsync(porCancelar);
      toast.exito('Reserva cancelada. Las prendas vuelven a estar disponibles.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos cancelar la reserva.');
    } finally {
      setPorCancelar(null);
    }
  }

  return (
    <div className="fs-contenedor" style={{ paddingTop: 32 }}>
      <div className="fs-seccion__cabecera">
        <div>
          <p className="fs-eyebrow">Mi cuenta</p>
          <h1>Mis reservas</h1>
        </div>
        <Link to="/reservas/nueva" className="fs-btn fs-btn--acento fs-btn--s">
          Nueva reserva
        </Link>
      </div>

      {reciente.isError && (
        <ErrorEstado error={reciente.error} onReintentar={() => reciente.refetch()} />
      )}
      {reservas.length === 0 && (
        <Vacio
          titulo="Aun no tienes reservas"
          mensaje="Aparta prendas para probartelas en la sucursal que prefieras."
          accion={
            <Link to="/reservas/nueva" className="fs-btn fs-btn--acento">
              Crear reserva
            </Link>
          }
        />
      )}

      <div className="fs-pila" style={{ gap: 16 }}>
        {reservas.map((r) => (
          <article
            key={r.id_reserva}
            className="fs-panel"
            style={destacada === r.id_reserva ? { borderColor: 'var(--fs-acento)' } : undefined}
          >
            <div className="fs-fila-entre">
              <div>
                <p className="fs-eyebrow">Reserva #{r.id_reserva}</p>
                <h3>{r.sucursal?.nombre}</h3>
                <p className="fs-sub">Visita programada: {fechaHora(r.horario_aproximado)}</p>
              </div>
              <BadgeReserva estado={r.estado} />
            </div>

            {r.vence_en && CANCELABLES_CLIENTE.includes(r.estado) && (
              <p className="fs-sub">
                Limite de presentacion: {fechaHora(r.vence_en)}. Pasado ese limite la reserva vence
                automaticamente.
              </p>
            )}
            <hr className="fs-divisor" />

            <ul className="fs-pila" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
              {r.detalles.map((d) => (
                <li key={d.id_detalle_reserva} className="fs-fila-entre">
                  <span>
                    {d.cantidad} x {d.producto?.nombre}
                    <span className="fs-sub">
                      {' '}
                      - Talla {d.talla?.nombre} / {d.color?.nombre}
                    </span>
                  </span>
                  <span className="fs-sub">{d.estado}</span>
                </li>
              ))}
            </ul>

            {r.observacion && <p className="fs-sub">Nota: {r.observacion}</p>}

            {CANCELABLES_CLIENTE.includes(r.estado) && (
              <div className="fs-fila" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="fs-btn fs-btn--contorno fs-btn--s"
                  disabled={cancelar.isPending}
                  onClick={() => setPorCancelar(r.id_reserva)}
                >
                  Cancelar reserva
                </button>
              </div>
            )}
          </article>
        ))}
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
        abierto={porCancelar !== null}
        titulo="Cancelar reserva"
        mensaje="Las prendas apartadas volveran a estar disponibles para otros clientes. Quieres continuar?"
        textoConfirmar="Si, cancelar"
        peligro
        cargando={cancelar.isPending}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => !cancelar.isPending && setPorCancelar(null)}
      />
    </div>
  );
}
