import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { useEmpresaActiva } from '../../hooks/useEmpresaActiva';
import { useSucursales } from '../../hooks/useOperaciones';
import { fijarSucursalTienda, useSucursalTienda } from '../../lib/sucursal-tienda';

/**
 * F17: al entrar a la tienda el cliente elige su sucursal; desde ahi ve las prendas de esa
 * sucursal y compra o reserva sin volver a elegirla. Se puede cambiar cuando quiera.
 */
export default function ElegirSucursal({ volver }: { volver?: string }) {
  const sucursales = useSucursales();
  const actual = useSucursalTienda();
  const empresa = useEmpresaActiva();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const destino = volver ?? params.get('volver') ?? '/tienda';
  const activas = (sucursales.data ?? []).filter((s) => s.activa !== false);

  function elegir(s: { id_sucursal: number; nombre: string; ciudad: string }) {
    fijarSucursalTienda(s);
    navegar(destino.startsWith('/') ? destino : '/tienda', { replace: true });
  }

  return (
    <div className="fs-contenedor fs-seccion fs-pila" style={{ gap: 20 }}>
      <div>
        <p className="fs-eyebrow">{empresa?.nombre ?? empresa?.slug}</p>
        <h1>{actual ? 'Cambiar de sucursal' : 'Elige tu sucursal'}</h1>
        <p className="fs-sub">
          Veras las prendas disponibles en la sucursal que elijas. Ahi retiras tus compras y te
          pruebas tus reservas.
        </p>
      </div>
      {sucursales.isPending && <FilasSkeleton filas={3} />}
      {sucursales.isError && <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />}
      {sucursales.isSuccess && activas.length === 0 && (
        <Vacio titulo="Sin sucursales abiertas" mensaje="Esta tienda aun no tiene sucursales atendiendo." />
      )}
      <div className="fs-sucursales-tienda">
        {activas.map((s) => {
          const elegida = actual?.id_sucursal === s.id_sucursal;
          return (
            <button
              key={s.id_sucursal}
              type="button"
              className={`fs-tarjeta fs-tarjeta--pad fs-sucursal-opcion${elegida ? ' fs-sucursal-opcion--activa' : ''}`}
              onClick={() => elegir(s)}
            >
              <strong>{s.nombre}</strong>
              <span className="fs-sub">{s.ciudad}</span>
              {s.direccion && <span className="fs-sub">{s.direccion}</span>}
              {s.telefono && <span className="fs-sub">Tel. {s.telefono}</span>}
              <span className="fs-sucursal-opcion__accion">{elegida ? 'Sucursal actual' : 'Comprar aqui'}</span>
            </button>
          );
        })}
      </div>
      {actual && (
        <button type="button" className="fs-btn fs-btn--fantasma" style={{ alignSelf: 'flex-start' }} onClick={() => navegar(-1)}>
          Seguir en {actual.nombre}
        </button>
      )}
    </div>
  );
}
