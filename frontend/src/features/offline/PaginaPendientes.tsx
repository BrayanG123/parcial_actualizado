import { useState } from 'react';
import { fechaHora, moneda } from '../../lib/format';
import { useAlcanceOffline, useDatosOffline, useSincronizacionAutomatica } from '../../hooks/useOffline';
import { descartar } from '../../offline/sincronizador';
import { ETIQUETA_OPERACION, PENDIENTES, type EstadoOperacion, type OperacionLocal } from '../../offline/tipos';
import { BadgeOperacion, DetalleConflicto } from './componentes';

const TIPOS: Record<string, string> = { SALE_CASH: 'Venta', RESERVATION: 'Reserva', EXCHANGE: 'Cambio' };
const FILTROS: Array<'PENDIENTES' | 'TODAS' | EstadoOperacion> = ['PENDIENTES', 'TODAS', 'CONFLICT', 'CONFIRMED', 'REJECTED'];

/** F5.5: operaciones locales con su estado, detalle de conflictos, reintento y descarte. */
export default function PaginaPendientes() {
  const alcance = useAlcanceOffline();
  const { operaciones, pendientes, ultimaSync, error } = useDatosOffline(alcance);
  const { enLinea, sincronizando, ultimo, sincronizarAhora } = useSincronizacionAutomatica(
    alcance,
    pendientes.length > 0,
  );
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('PENDIENTES');
  const [aviso, setAviso] = useState('');
  const visibles = operaciones.filter((op) =>
    filtro === 'TODAS' ? true : filtro === 'PENDIENTES' ? PENDIENTES.includes(op.estado) : op.estado === filtro,
  );

  async function accion(fn: () => Promise<unknown>) {
    setAviso('');
    try {
      await fn();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo completar la accion.');
    }
  }

  return (
    <div className="fs-pila">
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Operacion offline</p>
          <h1>Operaciones pendientes</h1>
          <p className="fs-sub">
            {enLinea ? 'Conectado: se sincroniza automaticamente.' : 'Sin conexion: todo queda guardado en este dispositivo.'}{' '}
            {ultimaSync && `Ultima sincronizacion: ${fechaHora(ultimaSync)}.`}
          </p>
        </div>
        <button
          type="button"
          className="fs-btn fs-btn--acento"
          disabled={!enLinea || sincronizando || pendientes.length === 0}
          onClick={() => accion(() => sincronizarAhora())}
        >
          {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </header>
      {(error || aviso) && <div className="fs-alerta fs-alerta--error">{error || aviso}</div>}
      {ultimo && ultimo.enviadas > 0 && (
        <div className="fs-alerta fs-alerta--info" role="status">
          Ultimo envio: {ultimo.confirmadas} confirmadas, {ultimo.conflictos} en conflicto, {ultimo.rechazadas}{' '}
          rechazadas{ultimo.reintentos ? `, ${ultimo.reintentos} para reintentar` : ''}.
        </div>
      )}
      <div className="fs-fila-wrap" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            className={`fs-btn fs-btn--s ${filtro === f ? 'fs-btn--acento' : 'fs-btn--contorno'}`}
            onClick={() => setFiltro(f)}
          >
            {f === 'PENDIENTES' ? `Pendientes (${pendientes.length})` : f === 'TODAS' ? 'Todas' : ETIQUETA_OPERACION[f]}
          </button>
        ))}
      </div>
      {visibles.length === 0 && <p className="fs-sub">No hay operaciones en este filtro.</p>}
      {visibles.map((op) => (
        <TarjetaOperacion
          key={op.operationId}
          op={op}
          enLinea={enLinea}
          onReintentar={() => accion(() => sincronizarAhora([op.operationId]))}
          onDescartar={() =>
            window.confirm('La operacion quedara como descartada (no se borra). ¿Continuar?') &&
            accion(() => descartar(op))
          }
        />
      ))}
    </div>
  );
}

function TarjetaOperacion({
  op,
  enLinea,
  onReintentar,
  onDescartar,
}: {
  op: OperacionLocal;
  enLinea: boolean;
  onReintentar: () => void;
  onDescartar: () => void;
}) {
  return (
    <article className="fs-tarjeta fs-tarjeta--pad fs-pila" style={{ gap: 6 }} data-operacion={op.operationId}>
      <div className="fs-fila-entre">
        <strong>
          {TIPOS[op.tipo] ?? op.tipo} · {op.resumen.titulo}
        </strong>
        <BadgeOperacion estado={op.estado} />
      </div>
      <p className="fs-sub">
        Registrada {fechaHora(op.createdAtLocal)} · ID {op.operationId.slice(0, 8)} · intentos {op.intentos}
        {op.resumen.total !== undefined && ` · total ${moneda(op.resumen.total, op.resumen.moneda)}`}
      </p>
      <ul style={{ margin: 0 }}>
        {op.resumen.lineas.map((l, i) => (
          <li key={i}>
            {l.cantidad} × {l.nombre}
          </li>
        ))}
      </ul>
      {op.estado === 'CONFIRMED' && op.resultado?.recurso && (
        <p>
          Confirmada por el servidor: {op.resultado.recurso.tipo === 'SALE' ? 'venta' : 'reserva'} #{op.resultado.recurso.id}
        </p>
      )}
      {['CONFLICT', 'REJECTED', 'RETRY'].includes(op.estado) && <DetalleConflicto op={op} />}
      {op.nota && <p className="fs-sub">{op.nota}</p>}
      {(op.estado === 'CONFLICT' || op.estado === 'RETRY' || op.estado === 'REJECTED' || op.estado === 'LOCAL') && (
        <div className="fs-fila-wrap">
          {(op.estado === 'CONFLICT' || op.estado === 'RETRY') && (
            <button type="button" className="fs-btn fs-btn--contorno fs-btn--s" disabled={!enLinea} onClick={onReintentar}>
              Reintentar
            </button>
          )}
          <button type="button" className="fs-btn fs-btn--fantasma fs-btn--s" onClick={onDescartar}>
            Descartar
          </button>
        </div>
      )}
    </article>
  );
}
