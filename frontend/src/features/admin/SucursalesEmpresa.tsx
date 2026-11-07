import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { usePlanEmpresa } from '../../hooks/usePlanEmpresa';
import { useReporteVentas } from '../../hooks/useOperaciones';
import { moneda } from '../../lib/format';
import { sucursalesService } from '../../services/organizacion.service';

/**
 * F14: al entrar a una empresa lo primero son sus sucursales: cuantas usa frente al limite
 * del plan y como va cada una (ventas de los ultimos 30 dias).
 */
export function SucursalesEmpresa() {
  const { plan } = usePlanEmpresa();
  const sucursales = useQuery({ queryKey: ['sucursales', 'todas'], queryFn: sucursalesService.listarTodas });
  const ventas = useReporteVentas();
  const porSucursal = new Map((ventas.data?.por_sucursal ?? []).map((v) => [v.id_sucursal, v]));
  const activas = plan?.uso.sucursales_activas ?? sucursales.data?.filter((s) => s.activa).length ?? 0;
  const maximo = plan?.plan?.max_sucursales_activas;
  const disponibles = plan?.uso.sucursales_disponibles ?? 0;

  return (
    <section className="fs-pila" style={{ marginBottom: 24 }}>
      <div className="fs-fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem' }}>Sucursales{plan?.empresa ? ` de ${plan.empresa.nombre}` : ''}</h2>
          <p className="fs-sub">
            {activas} {maximo ? `de ${maximo}` : ''} sucursales activas
            {plan?.plan ? ` · plan ${plan.plan.nombre}` : ''}
            {maximo && disponibles <= 0 ? ' · llegaste al limite de tu plan' : ''}
          </p>
        </div>
        <Link to="/admin/sucursales" className="fs-btn fs-btn--contorno fs-btn--s">
          {disponibles > 0 ? 'Gestionar o crear sucursales' : 'Gestionar sucursales'}
        </Link>
      </div>

      {sucursales.isPending && <FilasSkeleton filas={1} />}
      {sucursales.isError && <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />}
      {sucursales.data?.length === 0 && (
        <div className="fs-tarjeta fs-tarjeta--pad">
          <p>Tu empresa aun no tiene sucursales.</p>
          <Link to="/admin/sucursales" className="fs-btn fs-btn--acento fs-btn--s" style={{ marginTop: 8 }}>
            Crear la primera sucursal
          </Link>
        </div>
      )}
      <div className="fs-sucursales-resumen">
        {sucursales.data?.map((s) => {
          const v = porSucursal.get(s.id_sucursal);
          return (
            <article key={s.id_sucursal} className={`fs-tarjeta fs-tarjeta--pad${s.activa ? '' : ' fs-sucursal--inactiva'}`}>
              <div className="fs-fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <strong>{s.nombre}</strong>
                <span className={`fs-badge${s.activa ? ' fs-badge--exito' : ''}`}>{s.activa ? 'Activa' : 'Inactiva'}</span>
              </div>
              <p className="fs-sub">
                {s.ciudad} · {s.direccion}
              </p>
              <p style={{ marginTop: 8 }}>
                <strong>{moneda(v?.total ?? 0, ventas.data?.moneda)}</strong>{' '}
                <span className="fs-sub">· {v?.cantidad ?? 0} ventas en 30 dias</span>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
