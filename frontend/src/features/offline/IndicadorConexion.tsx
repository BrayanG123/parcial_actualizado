import { Link } from 'react-router-dom';
import { useAlcanceOffline, useDatosOffline, useSincronizacionAutomatica } from '../../hooks/useOffline';

/**
 * Indicador global online/offline con operaciones pendientes (F5.6). Tambien
 * dispara la sincronizacion automatica mientras la aplicacion esta abierta.
 */
export function IndicadorConexion({ rutaPendientes }: { rutaPendientes: string }) {
  const alcance = useAlcanceOffline();
  const { pendientes, operaciones } = useDatosOffline(alcance);
  const { enLinea, sincronizando } = useSincronizacionAutomatica(alcance, pendientes.length > 0);
  const conflictos = operaciones.filter((op) => op.estado === 'CONFLICT').length;
  // En linea y sin pendientes no hace falta ocupar espacio en la cabecera.
  if (enLinea && !sincronizando && pendientes.length === 0) return null;
  return (
    <span className="fs-fila" style={{ gap: 6 }} aria-live="polite">
      <span
        style={{ whiteSpace: 'nowrap' }}
        className={`fs-badge ${enLinea ? 'fs-badge--exito' : 'fs-badge--alerta'}`}
        title={enLinea ? 'Conectado al servidor' : 'Sin conexion: las operaciones se guardan en este dispositivo'}
      >
        {enLinea ? (sincronizando ? 'Sincronizando...' : 'En linea') : 'Sin conexion'}
      </span>
      {alcance && pendientes.length > 0 && (
        <Link
          to={rutaPendientes}
          style={{ whiteSpace: 'nowrap' }}
          className={`fs-badge ${conflictos ? 'fs-badge--error' : 'fs-badge--info'}`}
        >
          {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
          {conflictos ? ` · ${conflictos} en conflicto` : ''}
        </Link>
      )}
    </span>
  );
}
