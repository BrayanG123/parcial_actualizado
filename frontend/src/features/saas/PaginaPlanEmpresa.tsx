import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { usePlanEmpresa } from '../../hooks/usePlanEmpresa';
import { fecha } from '../../lib/format';
import { ETIQUETA_ESTADO, NOMBRE_FUNCION, type Funcionalidades } from '../../types/saas';
import { TarjetaKPI } from '../reports/componentes';


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

/** F2.8 / F3.3: plan actual, limites, uso y vencimiento de la empresa. */
export default function PaginaPlanEmpresa() {
  const { plan, isPending, isError, error, refetch } = usePlanEmpresa();
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Organizacion</p>
          <h1>Plan y suscripcion</h1>
          <p className="fs-sub">
            Plan contratado por {plan?.empresa?.nombre ?? 'la empresa'}. Los cambios de plan y renovaciones los
            realiza el administrador de la plataforma.
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
              valor={plan.suscripcion ? ETIQUETA_ESTADO[plan.suscripcion.estado] : 'Sin suscripcion'}
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
            </div>
          )}
          <section className="fs-tarjeta fs-tarjeta--pad">
            <h2 className="fs-titulo-seccion">Funcionalidades del plan</h2>
            <ListaFunciones funciones={plan.plan?.funcionalidades ?? {}} />
          </section>
        </>
      )}
    </>
  );
}
