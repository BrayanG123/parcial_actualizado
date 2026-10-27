import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { moneda } from '../../lib/format';
import { useAlcanceOffline, useDatosOffline, useSincronizacionAutomatica } from '../../hooks/useOffline';
import { registrarReserva, totalSeleccion, type ItemSeleccion } from '../../offline/cola';
import { descargarSnapshot } from '../../offline/descarga';
import { AvisoAntiguedad, CatalogoOffline } from './componentes';

/**
 * F5.2 + F5.4: catalogo descargado (consultable sin conexion) y reserva offline del
 * cliente. La reserva se confirma con el servidor al sincronizar.
 */
export default function PaginaTiendaOffline() {
  const { usuario, esCliente } = useAuth();
  const alcance = useAlcanceOffline();
  const [sucursal, setSucursal] = useState<number | undefined>();
  const base = useDatosOffline(alcance);
  const elegida = useDatosOffline(alcance, sucursal);
  const { operaciones, pendientes } = base;
  // Sin sucursal elegida se muestra la ultima descarga; la lista de sucursales sale de ella.
  const snapshot = sucursal ? elegida.snapshot : base.snapshot;
  const sucursales = base.snapshot?.branches ?? [];
  const { enLinea, sincronizarAhora } = useSincronizacionAutomatica(alcance, pendientes.length > 0);
  const [seleccion, setSeleccion] = useState<ItemSeleccion[]>([]);
  const [horario, setHorario] = useState('');
  const [nota, setNota] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Candado sincrono: dos clics seguidos no deben registrar dos operaciones.
  const candado = useRef(false);

  async function accion(fn: () => Promise<unknown>) {
    if (candado.current) return;
    candado.current = true;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operacion.');
    } finally {
      candado.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className="fs-contenedor fs-pila" style={{ paddingBlock: 24 }}>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Tienda sin conexion</p>
          <h1>Catalogo descargado</h1>
          <p className="fs-sub">
            Descarga el catalogo de una sucursal para consultarlo y reservar aunque pierdas la conexion.
          </p>
        </div>
        <Link to="/pendientes" className="fs-btn fs-btn--contorno">
          Mis pendientes ({pendientes.length})
        </Link>
      </header>
      {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
      {mensaje && (
        <div className="fs-alerta fs-alerta--exito" role="status">
          {mensaje}
        </div>
      )}
      <div className="fs-fila-wrap">
        {sucursales.length > 1 && (
          <select
            className="fs-input"
            aria-label="Sucursal"
            value={sucursal ?? base.snapshot?.branchId}
            onChange={(e) => {
              setSucursal(Number(e.target.value));
              setSeleccion([]);
            }}
          >
            {sucursales.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.city}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="fs-btn fs-btn--acento"
          disabled={ocupado || !enLinea || !usuario || !alcance}
          onClick={() => accion(() => descargarSnapshot(alcance!, usuario!, sucursal ?? base.snapshot?.branchId))}
        >
          {snapshot ? 'Actualizar catalogo' : 'Descargar catalogo'}
        </button>
      </div>
      {!usuario && <p>Inicia sesion para descargar el catalogo y reservar sin conexion.</p>}
      {usuario && !snapshot && (
        <p className="fs-sub">
          {enLinea
            ? 'Todavia no descargaste el catalogo de esta sucursal en este navegador.'
            : 'Sin conexion y sin datos descargados: conectate para descargar el catalogo.'}
        </p>
      )}
      {snapshot && (
        <>
          <AvisoAntiguedad snapshot={snapshot} />
          <div className="fs-pos">
            <section className="fs-tarjeta fs-tarjeta--pad">
              <CatalogoOffline
                snapshot={snapshot}
                operaciones={operaciones}
                seleccion={seleccion}
                onCambiar={setSeleccion}
              />
            </section>
            {esCliente && (
              <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
                <h2 className="fs-titulo-seccion">Reservar en {snapshot.branch.name}</h2>
                <p>{seleccion.reduce((a, i) => a + i.quantity, 0)} prendas seleccionadas</p>
                <p>Total estimado: {moneda(totalSeleccion(snapshot, seleccion), snapshot.currency)}</p>
                <label className="fs-campo">
                  Fecha y hora aproximada de visita
                  <input
                    type="datetime-local"
                    className="fs-input"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                  />
                </label>
                <label className="fs-campo">
                  Observacion (opcional)
                  <input className="fs-input" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="fs-btn fs-btn--acento"
                  disabled={ocupado || !seleccion.length || !horario}
                  onClick={() =>
                    accion(async () => {
                      await registrarReserva(alcance!, snapshot, { items: seleccion, horario, observacion: nota });
                      setSeleccion([]);
                      setHorario('');
                      setNota('');
                      setMensaje(
                        navigator.onLine
                          ? 'Reserva guardada. Se esta enviando a la tienda.'
                          : 'Reserva guardada en este dispositivo. Se enviara al recuperar la conexion.',
                      );
                      if (navigator.onLine) void sincronizarAhora().catch(() => undefined);
                    })
                  }
                >
                  Reservar (offline)
                </button>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
