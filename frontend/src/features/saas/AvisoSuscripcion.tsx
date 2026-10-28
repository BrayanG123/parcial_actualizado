import { Link } from 'react-router-dom';
import { usePlanEmpresa } from '../../hooks/usePlanEmpresa';
import { fecha } from '../../lib/format';
import { ETIQUETA_ESTADO } from '../../types/saas';

const DIAS_AVISO = 7;

/** Aviso global del panel: empresa en solo lectura o suscripcion por vencer. */
export function AvisoSuscripcion({ enlacePlan }: { enlacePlan?: string }) {
  const { plan } = usePlanEmpresa();
  const suscripcion = plan?.suscripcion;
  if (!plan || !suscripcion) return null;
  if (plan.solo_lectura)
    return (
      <div className="fs-alerta fs-alerta--error" role="alert" style={{ marginBottom: 16 }}>
        <strong>Modo solo lectura.</strong> La suscripcion de {plan.empresa?.nombre ?? 'la empresa'} esta{' '}
        {ETIQUETA_ESTADO[suscripcion.estado].toLowerCase()}
        {suscripcion.estado === 'EXPIRED' ? ` desde el ${fecha(suscripcion.vencimiento)}` : ''}. Puedes consultar la
        informacion, pero no registrar cambios hasta que la plataforma la renueve o reactive.
        {enlacePlan && (
          <>
            {' '}
            <Link to={enlacePlan}>Ver plan</Link>
          </>
        )}
      </div>
    );
  if ((suscripcion.dias_restantes ?? DIAS_AVISO + 1) <= DIAS_AVISO)
    return (
      <div className="fs-alerta fs-alerta--info" role="status" style={{ marginBottom: 16 }}>
        La suscripcion vence el {fecha(suscripcion.vencimiento)} ({suscripcion.dias_restantes} dias). Al vencer, el
        sistema quedara en modo solo lectura.
      </div>
    );
  return null;
}
