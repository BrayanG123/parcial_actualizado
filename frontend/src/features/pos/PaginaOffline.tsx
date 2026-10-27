import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { USAR_MOCKS } from '../../api/config';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { fechaHora, moneda } from '../../lib/format';
import { useAlcanceOffline, useDatosOffline, useSincronizacionAutomatica } from '../../hooks/useOffline';
import { registrarVenta, totalSeleccion, type ItemSeleccion } from '../../offline/cola';
import { descargarSnapshot } from '../../offline/descarga';
import type { OperacionLocal } from '../../offline/tipos';
import { AvisoAntiguedad, BadgeOperacion, CatalogoOffline, DetalleConflicto } from '../offline/componentes';

/**
 * Caja offline (F5.3): venta de contado registrada en IndexedDB y enviada con el
 * contrato /sync/operations. El turno se abre con conexion antes de descargar.
 */
export default function PaginaOffline() {
  const { usuario } = useAuth();
  if (USAR_MOCKS) return <p>La caja offline requiere el backend real.</p>;
  return usuario ? <CajaOffline /> : null;
}

function CajaOffline() {
  const { usuario } = useAuth();
  const alcance = useAlcanceOffline();
  const { operaciones, pendientes, snapshot, error: errorLocal } = useDatosOffline(alcance);
  const { enLinea, sincronizarAhora } = useSincronizacionAutomatica(alcance, pendientes.length > 0);
  const [seleccion, setSeleccion] = useState<ItemSeleccion[]>([]);
  const [recibido, setRecibido] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Candado sincrono: dos clics seguidos no deben registrar dos operaciones.
  const candado = useRef(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<OperacionLocal | null>(null);

  async function accion(fn: () => Promise<unknown>) {
    if (candado.current) return;
    candado.current = true;
    setOcupado(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operacion.');
    } finally {
      candado.current = false;
      setOcupado(false);
    }
  }

  const ventas = operaciones.filter((op) => op.tipo === 'SALE_CASH');
  const total = snapshot ? totalSeleccion(snapshot, seleccion) : 0;
  const efectivo = Number(recibido);

  return (
    <div className="fs-pila">
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Caja</p>
          <h1>Caja offline</h1>
          <p className="fs-sub">
            {enLinea
              ? 'Conectado: las ventas se envian automaticamente.'
              : 'Sin internet: las ventas se guardan en este navegador y se envian al reconectar.'}
          </p>
        </div>
        <div className="fs-fila">
          <Link to="/caja/pendientes" className="fs-btn fs-btn--contorno">
            Pendientes ({pendientes.length})
          </Link>
          <Link to="/caja" className="fs-btn fs-btn--contorno">
            Volver a caja
          </Link>
        </div>
      </header>
      {(error || errorLocal) && (
        <div role="alert" className="fs-alerta fs-alerta--error">
          {error || errorLocal}
        </div>
      )}

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <h2 className="fs-titulo-seccion">1. Preparar con conexion</h2>
        <p>
          Abre tu turno en Punto de venta y descarga el catalogo de tu sucursal. Las ventas offline son de contado; el
          servidor confirma precio y stock al sincronizar.
        </p>
        <button
          type="button"
          className="fs-btn fs-btn--acento"
          disabled={ocupado || !enLinea || !alcance}
          onClick={() => accion(() => descargarSnapshot(alcance!, usuario!))}
        >
          {snapshot ? 'Actualizar datos descargados' : 'Descargar datos de mi sucursal'}
        </button>
        {snapshot && <AvisoAntiguedad snapshot={snapshot} />}
        {snapshot && !snapshot.openShift && (
          <div className="fs-alerta fs-alerta--error">
            No habia un turno abierto al descargar. Abre tu turno en <Link to="/caja">Punto de venta</Link> y vuelve a
            descargar.
          </div>
        )}
        {snapshot?.openShift && (
          <p>
            {snapshot.branch.name} · {snapshot.openShift.register.name} · Turno #{snapshot.openShift.id}
          </p>
        )}
      </section>

      {snapshot?.openShift && (
        <div className="fs-pos">
          <section className="fs-tarjeta fs-tarjeta--pad">
            <h2 className="fs-titulo-seccion">2. Prendas</h2>
            <CatalogoOffline
              snapshot={snapshot}
              operaciones={operaciones}
              seleccion={seleccion}
              onCambiar={setSeleccion}
            />
          </section>
          <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
            <h2 className="fs-titulo-seccion">3. Cobro en efectivo</h2>
            {seleccion.length === 0 && <p className="fs-sub">Agrega prendas del catalogo.</p>}
            <label className="fs-campo">
              Cliente (opcional)
              <select className="fs-input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Consumidor final</option>
                {snapshot.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <strong>Total: {moneda(total, snapshot.currency)}</strong>
            <label className="fs-campo" htmlFor="efectivo-offline">
              Efectivo recibido
              <input
                id="efectivo-offline"
                type="number"
                min="0"
                step="0.01"
                className="fs-input"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
              />
            </label>
            <p>Cambio: {moneda(Number.isFinite(efectivo) ? Math.max(0, efectivo - total) : 0, snapshot.currency)}</p>
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={ocupado || !seleccion.length || !recibido}
              onClick={() =>
                accion(async () => {
                  const op = await registrarVenta(alcance!, snapshot, {
                    items: seleccion,
                    recibido: efectivo,
                    clienteId: clienteId ? Number(clienteId) : undefined,
                    usuarioId: usuario?.id_usuario,
                  });
                  setTicket(op);
                  setSeleccion([]);
                  setRecibido('');
                  setClienteId('');
                  if (navigator.onLine) void sincronizarAhora().catch(() => undefined);
                })
              }
            >
              Cobrar y guardar venta local
            </button>
          </section>
        </div>
      )}

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <h2 className="fs-titulo-seccion">Ventas offline de este navegador</h2>
        {ventas.length === 0 && <p className="fs-sub">Todavia no hay ventas offline.</p>}
        {ventas.slice(0, 30).map((op) => (
          <div key={op.operationId} className="fs-pila" style={{ gap: 4 }}>
            <div className="fs-fila-entre">
              <span>
                {fechaHora(op.createdAtLocal)} · {moneda(op.resumen.total ?? 0, op.resumen.moneda)}
                {op.resultado?.recurso ? ` · Venta #${op.resultado.recurso.id}` : ''}
              </span>
              <span className="fs-fila">
                <BadgeOperacion estado={op.estado} />
                <button type="button" className="fs-btn fs-btn--contorno fs-btn--s" onClick={() => setTicket(op)}>
                  Ver ticket
                </button>
              </span>
            </div>
            {op.estado === 'CONFLICT' && <DetalleConflicto op={op} />}
          </div>
        ))}
      </section>

      <Modal abierto={Boolean(ticket)} titulo="Ticket de venta offline" onCerrar={() => setTicket(null)}>
        {ticket && <TicketLocal op={ticket} />}
      </Modal>
    </div>
  );
}

function TicketLocal({ op }: { op: OperacionLocal }) {
  const recibido = Number(op.payload.cashReceived ?? 0);
  return (
    <div className="fs-pila">
      <strong>Ticket local {op.operationId}</strong>
      <p>
        {op.estado === 'CONFIRMED' && op.resultado?.recurso
          ? `Confirmado como venta #${op.resultado.recurso.id}.`
          : 'Efectivo recibido. Pendiente de confirmacion del servidor: no vuelvas a cobrarlo.'}
      </p>
      {op.resumen.lineas.map((l, i) => (
        <p key={i}>
          {l.cantidad} × {l.nombre} · {moneda(l.precio ?? 0, op.resumen.moneda)}
        </p>
      ))}
      <p>Total: {moneda(op.resumen.total ?? 0, op.resumen.moneda)}</p>
      <p>Cambio: {moneda(Math.max(0, recibido - (op.resumen.total ?? 0)), op.resumen.moneda)}</p>
    </div>
  );
}
