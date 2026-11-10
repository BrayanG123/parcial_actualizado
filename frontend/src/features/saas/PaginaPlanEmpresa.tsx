import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { claves } from '../../hooks/claves';
import { usePlanEmpresa } from '../../hooks/usePlanEmpresa';
import { fecha, fechaHora } from '../../lib/format';
import { saasService } from '../../services/saas.service';
import {
  ETIQUETA_PAGO,
  precioUsd,
  suscripcionService,
  type CobroSuscripcion,
} from '../../services/suscripcion.service';
import { ErrorApi } from '../../types/api';
import { ETIQUETA_ESTADO, NOMBRE_FUNCION, type Funcionalidades } from '../../types/saas';
import { TarjetaKPI } from '../reports/componentes';
import { PagoSuscripcion } from './PagoSuscripcion';
import '../../styles/landing.css';

export function ListaFunciones({ funciones }: { funciones: Funcionalidades }) {
  return (
    <ul className="fs-pila" style={{ gap: 6, listStyle: 'none', padding: 0 }}>
      {Object.entries(NOMBRE_FUNCION).map(([clave, nombre]) => (
        <li key={clave}>
          <span className={`fs-badge ${funciones[clave] ? 'fs-badge--exito' : 'fs-badge--error'}`}>
            {funciones[clave] ? 'Incluido' : 'No incluido'}
          </span>{' '}
          {nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Plan actual, uso y vencimiento de la empresa. El administrador puede cambiar de plan o
 * renovar pagando con Stripe; el cambio se aplica en cuanto se confirma el pago.
 */
export default function PaginaPlanEmpresa() {
  const { plan, isPending, isError, error, refetch } = usePlanEmpresa();
  const { tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');
  const qc = useQueryClient();
  const toast = useToast();
  const planes = useQuery({ queryKey: ['saas', 'planes'], queryFn: saasService.planes });
  const pagos = useQuery({
    queryKey: ['suscripcion', 'pagos'],
    queryFn: suscripcionService.pagos,
    enabled: esAdmin,
  });
  const [cobro, setCobro] = useState<CobroSuscripcion | null>(null);
  const [tituloCobro, setTituloCobro] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');

  const actual = plan?.plan?.codigo;
  const vigente =
    plan?.suscripcion?.estado === 'ACTIVE' &&
    new Date(plan.suscripcion.vencimiento).getTime() > Date.now();

  async function actualizar() {
    await qc.invalidateQueries({ queryKey: claves.planEmpresa });
    void qc.invalidateQueries({ queryKey: ['suscripcion', 'pagos'] });
    void refetch();
  }

  async function ejecutar(clave: string, titulo: string, accion: () => ReturnType<typeof suscripcionService.renovar>) {
    setOcupado(clave);
    setMensaje('');
    try {
      const r = await accion();
      if (r.paymentRequired) {
        setTituloCobro(titulo);
        setCobro(r);
      } else {
        toast.exito('Plan actualizado.');
        await actualizar();
      }
    } catch (e) {
      setMensaje(e instanceof ErrorApi ? e.mensajes.join(' ') : 'No se pudo iniciar el cambio de plan.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Organizacion</p>
          <h1>Plan y suscripcion</h1>
          <p className="fs-sub">
            Plan contratado por {plan?.empresa?.nombre ?? 'la empresa'}.{' '}
            {esAdmin
              ? 'Puedes cambiar de plan o renovar pagando con tarjeta.'
              : 'Solo el administrador puede cambiar o renovar el plan.'}
          </p>
        </div>
      </header>
      {isPending && <FilasSkeleton filas={3} />}
      {isError && <ErrorEstado error={error} onReintentar={() => refetch()} />}
      {plan && (
        <>
          <section className="fs-kpis">
            <TarjetaKPI etiqueta="Plan" valor={plan.plan?.nombre ?? 'Sin plan'} detalle={plan.plan?.codigo ?? ''} />
            <TarjetaKPI
              etiqueta="Suscripcion"
              valor={plan.suscripcion ? (vigente ? ETIQUETA_ESTADO.ACTIVE : ETIQUETA_ESTADO[plan.suscripcion.estado === 'ACTIVE' ? 'EXPIRED' : plan.suscripcion.estado]) : 'Sin suscripcion'}
              detalle={plan.suscripcion ? `Vence el ${fecha(plan.suscripcion.vencimiento)}` : ''}
            />
            <TarjetaKPI
              etiqueta="Sucursales activas"
              valor={`${plan.uso.sucursales_activas} / ${plan.plan?.max_sucursales_activas ?? 0}`}
              detalle={`${plan.uso.sucursales_disponibles} disponibles en el plan`}
            />
            <TarjetaKPI etiqueta="Usuarios" valor={String(plan.uso.usuarios)} detalle="de la empresa" />
          </section>
          {plan.solo_lectura && (
            <div className="fs-alerta fs-alerta--error" role="alert">
              La empresa esta en modo solo lectura: se permiten consultas, pero no registrar cambios.
              {esAdmin && ' Renueva o cambia de plan para reactivarla.'}
            </div>
          )}
          {mensaje && (
            <div className="fs-alerta fs-alerta--error" role="alert">
              {mensaje}
            </div>
          )}

          {esAdmin && (
            <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
              <h2 className="fs-titulo-seccion">Planes disponibles</h2>
              {planes.isError && <ErrorEstado error={planes.error} onReintentar={() => planes.refetch()} />}
              <div className="fs-planes-empresa">
                {planes.data?.map((p) => {
                  const esActual = p.codigo === actual;
                  return (
                    <article
                      key={p.codigo}
                      className={`fs-plan-empresa${esActual ? ' fs-plan-empresa--actual' : ''}`}
                    >
                      <div className="fs-fila-entre">
                        <strong>{p.nombre}</strong>
                        {esActual && <span className="fs-badge fs-badge--exito">Tu plan</span>}
                      </div>
                      <p className="fs-plan-empresa__precio">
                        {p.precio_mensual > 0 ? `${precioUsd(p.precio_mensual)} / mes` : 'Gratis'}
                      </p>
                      <p className="fs-sub">
                        {p.max_sucursales} {p.max_sucursales === 1 ? 'sucursal activa' : 'sucursales activas'}
                        {p.descripcion ? ` · ${p.descripcion}` : ''}
                      </p>
                      {esActual ? (
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno"
                          disabled={Boolean(ocupado)}
                          onClick={() =>
                            ejecutar('renovar', `Renovar plan ${p.nombre}`, () => suscripcionService.renovar(1))
                          }
                        >
                          {ocupado === 'renovar'
                            ? 'Preparando...'
                            : p.precio_mensual > 0
                              ? `Renovar 1 mes (${precioUsd(p.precio_mensual)})`
                              : 'Renovar 1 mes'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="fs-btn fs-btn--acento"
                          disabled={Boolean(ocupado)}
                          onClick={() =>
                            ejecutar(p.codigo, `Cambiar al plan ${p.nombre}`, () =>
                              suscripcionService.cambiarPlan(p.codigo),
                            )
                          }
                        >
                          {ocupado === p.codigo
                            ? 'Preparando...'
                            : p.precio_mensual > 0
                              ? `Cambiar a ${p.nombre}`
                              : `Cambiar a ${p.nombre} (gratis)`}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="fs-sub">
                Al cambiar de plan el nuevo periodo de un mes empieza el dia del pago. Para bajar a un plan
                con menos sucursales, primero desactiva las que sobren.
              </p>
            </section>
          )}

          <section className="fs-tarjeta fs-tarjeta--pad">
            <h2 className="fs-titulo-seccion">Funcionalidades del plan</h2>
            <ListaFunciones funciones={plan.plan?.funcionalidades ?? {}} />
          </section>

          {esAdmin && (
            <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
              <h2 className="fs-titulo-seccion">Pagos de la suscripcion</h2>
              {pagos.isError && <ErrorEstado error={pagos.error} onReintentar={() => pagos.refetch()} />}
              {pagos.data?.length === 0 && <p className="fs-sub">Todavia no hay pagos registrados.</p>}
              {pagos.data && pagos.data.length > 0 && (
                <div className="fs-tabla-scroll">
                  <table className="fs-tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Concepto</th>
                        <th>Plan</th>
                        <th>Meses</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagos.data.map((p) => (
                        <tr key={p.paymentId}>
                          <td>{fechaHora(p.paidAt ?? p.createdAt)}</td>
                          <td>{p.kindLabel}</td>
                          <td>{p.plan?.name ?? '-'}</td>
                          <td>{p.months}</td>
                          <td>{ETIQUETA_PAGO[p.status]}</td>
                          <td style={{ textAlign: 'right' }}>{precioUsd(p.amount, p.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
      <Modal abierto={Boolean(cobro)} titulo={tituloCobro || 'Pago de suscripcion'} ancho onCerrar={() => setCobro(null)}>
        {cobro && (
          <PagoSuscripcion
            cobro={cobro}
            titulo="Datos de la tarjeta"
            onPagado={async () => {
              setCobro(null);
              toast.exito('Pago confirmado: tu plan ya esta actualizado.');
              await actualizar();
            }}
            onCancelar={() => setCobro(null)}
          />
        )}
      </Modal>
    </>
  );
}
