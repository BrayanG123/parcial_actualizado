import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorEstado } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { ComprobanteVenta } from '../sales/ComprobanteVenta';
import { turnosService } from '../../services/turnos.service';
import type { ItemPOS } from '../../services/pos.service';
import {
  claveVariante,
  disponibles,
  exportarOffline,
  finalizarOffline,
  guardarTicketOffline,
  leerOffline,
  observarOffline,
  prepararOffline,
  sincronizarOffline,
  totalOffline,
  type CajaOffline,
  type TicketOffline,
} from '../../lib/offline';
import { fechaHora, moneda } from '../../lib/format';
import { USAR_MOCKS } from '../../api/config';
import type { Usuario } from '../../types/domain';

export default function PaginaOffline() {
  const auth = useAuth();
  if (USAR_MOCKS) return <p>La caja offline requiere el backend real.</p>;
  return auth.usuario ? (
    <CajaSinConexion
      key={auth.usuario.id_usuario}
      usuario={auth.usuario}
      onConectado={auth.reintentarSesion}
    />
  ) : null;
}
function inicio(userId: number) {
  try {
    return { data: leerOffline(userId), error: '' };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Error al leer el almacenamiento local.',
    };
  }
}
function CajaSinConexion({ usuario, onConectado }: { usuario: Usuario; onConectado: () => void }) {
  const userId = usuario.id_usuario;
  const [local, setLocal] = useState(() => inicio(userId));
  const state = local.data;
  const [ahora, setAhora] = useState(() => Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ItemPOS[]>([]);
  const [recibido, setRecibido] = useState('');
  const [detalle, setDetalle] = useState<TicketOffline | null>(null);
  const qc = useQueryClient();
  const turno = useQuery({
    queryKey: ['turno-actual', userId],
    queryFn: turnosService.actual,
    enabled: online && !state,
  });
  useEffect(() => observarOffline(() => setLocal(inicio(userId))), [userId]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const timer = window.setInterval(() => setAhora(Date.now()), 30000);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!online) return;
    const sync = () => {
      void sincronizarOffline(userId).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo sincronizar.'),
      );
    };
    sync();
    const timer = window.setInterval(sync, 15000);
    return () => window.clearInterval(timer);
  }, [online, userId]);
  async function accion(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operacion.');
    } finally {
      lock.current = false;
      setBusy(false);
      setLocal(inicio(userId));
    }
  }
  function cantidad(item: ItemPOS, delta: number) {
    if (!state || state.finalizando) return;
    const found = items.find((i) => claveVariante(i) === claveVariante(item));
    const quantity = Math.max(
      0,
      Math.min(100, disponibles(state, item), (found?.quantity ?? 0) + delta),
    );
    setItems((old) => [
      ...old.filter((i) => claveVariante(i) !== claveVariante(item)),
      ...(quantity
        ? [{ productId: item.productId, sizeId: item.sizeId, colorId: item.colorId, quantity }]
        : []),
    ]);
  }
  let total = 0;
  let errorTicket = '';
  if (state && items.length) {
    try {
      total = totalOffline(state, items);
    } catch (e) {
      errorTicket = (e as Error).message;
    }
  }
  const pendientes = state?.tickets.filter((t) => !t.venta) ?? [];
  const expired = state ? ahora > new Date(state.lote.snapshot.expiresAt).getTime() : false;
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <h1>Caja offline</h1>
          <p className="fs-sub">
            {online
              ? 'Conexion disponible: sincronizacion automatica cada 15 segundos.'
              : 'Sin internet: los tickets se guardan en este navegador.'}
          </p>
        </div>
        <Link to="/caja" className="fs-btn fs-btn--contorno">
          Volver a caja
        </Link>
      </header>
      {(error || local.error) && (
        <p role="alert" className="fs-campo-error">
          {error || local.error}
        </p>
      )}
      {!state ? (
        <section className="fs-panel fs-pila">
          <h2>Preparar antes de desconectar</h2>
          <p>
            Abre tu turno con internet y descarga las prendas disponibles. Este modo cobra en
            efectivo a consumidor final, con los precios de la descarga durante 24 horas.
          </p>
          <p>Las reservas y clientes mayoristas se atienden desde la caja normal con conexion.</p>
          {turno.isFetching && <p>Consultando turno...</p>}
          {turno.isError && (
            <ErrorEstado error={turno.error} onReintentar={() => turno.refetch()} />
          )}
          {turno.data ? (
            <p>
              Turno #{turno.data.id} · {turno.data.branchName} / {turno.data.registerName}
            </p>
          ) : (
            <p>Primero abre tu turno desde Punto de venta.</p>
          )}
          {import.meta.env.DEV && (
            <p>
              Para recargar sin internet durante la presentacion, usa la compilacion PWA con npm run
              build y npm run preview.
            </p>
          )}
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            disabled={
              busy ||
              !online ||
              !turno.data ||
              turno.isError ||
              turno.isFetching ||
              Boolean(local.error)
            }
            onClick={() =>
              accion(async () => {
                if (import.meta.env.PROD) {
                  if (!('serviceWorker' in navigator))
                    throw new Error('Usa HTTPS o localhost para preparar la PWA.');
                  await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((_, reject) =>
                      setTimeout(
                        () =>
                          reject(
                            new Error(
                              'No se completo la preparacion PWA. Recarga con internet e intenta nuevamente.',
                            ),
                          ),
                        15000,
                      ),
                    ),
                  ]);
                }
                await prepararOffline(usuario, turno.data!.id);
              })
            }
          >
            Descargar y activar modo offline
          </button>
        </section>
      ) : (
        <>
          <section className="fs-panel fs-pila">
            <h2>
              {state.lote.snapshot.branchName} · {state.lote.snapshot.registerName} · Turno #
              {state.lote.shiftId}
            </h2>
            <p>
              Descarga: {fechaHora(state.lote.preparedAt)}. Valida para vender hasta{' '}
              {fechaHora(state.lote.snapshot.expiresAt)}.
            </p>
            <p>
              <strong>{pendientes.length} tickets pendientes</strong> · Efectivo pendiente de
              sincronizar:{' '}
              {moneda(
                pendientes.reduce((a, t) => a + t.datos.expectedTotal, 0),
                state.lote.snapshot.currency,
              )}
            </p>
            <p>
              Conserva este navegador y sus datos hasta terminar la sincronizacion. El turno se
              cierra despues de finalizar este modo.
            </p>
            <div className="fs-fila-wrap">
              <button
                type="button"
                className="fs-btn fs-btn--contorno"
                disabled={busy || !online || state.finalizando}
                onClick={() => accion(() => sincronizarOffline(userId, true))}
              >
                Sincronizar ahora
              </button>
              <button
                type="button"
                className="fs-btn fs-btn--contorno"
                onClick={() => exportarOffline(userId)}
              >
                Descargar respaldo
              </button>
              <button
                type="button"
                className="fs-btn fs-btn--acento"
                disabled={busy || !online || pendientes.length > 0 || items.length > 0}
                onClick={() =>
                  accion(async () => {
                    await finalizarOffline(userId);
                    onConectado();
                    await qc.invalidateQueries({ queryKey: ['turno-actual'] });
                    void qc.invalidateQueries({ queryKey: ['ventas'] });
                    void qc.invalidateQueries({ queryKey: ['inventario'] });
                  })
                }
              >
                {state.finalizando ? 'Reintentar finalizacion' : 'Finalizar modo offline'}
              </button>
            </div>
            {expired && (
              <p role="alert">
                La descarga vencio. Sincroniza y finaliza este modo para preparar otra descarga.
              </p>
            )}
          </section>
          <fieldset
            disabled={busy || expired || state.finalizando || Boolean(local.error)}
            style={{ border: 0, padding: 0 }}
          >
            <div className="fs-pos">
              <section className="fs-panel fs-pila">
                <h2>Prendas descargadas</h2>
                <input
                  className="fs-input"
                  aria-label="Buscar prenda offline"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="fs-pos__resultados">
                  {state.lote.snapshot.variants
                    .filter((v) =>
                      `${v.productName} ${v.sizeName} ${v.colorName}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((v) => {
                      const item = {
                        productId: v.productId,
                        sizeId: v.sizeId,
                        colorId: v.colorId,
                        quantity: 1,
                      };
                      const seleccionadas =
                        items.find((i) => claveVariante(i) === claveVariante(v))?.quantity ?? 0;
                      return (
                        <button
                          type="button"
                          className="fs-pos__item"
                          key={claveVariante(v)}
                          disabled={
                            disponibles(state, item) <= seleccionadas ||
                            seleccionadas >= 100 ||
                            (!seleccionadas && items.length >= 50)
                          }
                          onClick={() => cantidad(item, 1)}
                        >
                          <strong>{v.productName}</strong>
                          <span>
                            {v.sizeName} / {v.colorName}
                          </span>
                          <span>
                            {moneda(v.netUnitPrice, state.lote.snapshot.currency)} · Stock local:{' '}
                            {disponibles(state, item) - seleccionadas}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>
              <section className="fs-panel fs-pila">
                <h2>Ticket en efectivo</h2>
                <p>Consumidor final</p>
                {items.map((i) => {
                  const v = state.lote.snapshot.variants.find(
                    (v) => claveVariante(v) === claveVariante(i),
                  )!;
                  return (
                    <div key={claveVariante(i)} className="fs-fila-entre">
                      <span>
                        {v.productName} ({v.sizeName} / {v.colorName}) × {i.quantity}
                      </span>
                      <button
                        type="button"
                        className="fs-btn fs-btn--contorno"
                        aria-label={`Restar ${v.productName}`}
                        onClick={() => cantidad(i, -1)}
                      >
                        -
                      </button>
                    </div>
                  );
                })}
                {errorTicket && <p role="alert">{errorTicket}</p>}
                <strong>Total: {moneda(total, state.lote.snapshot.currency)}</strong>
                <label htmlFor="efectivo-offline">Efectivo recibido</label>
                <input
                  id="efectivo-offline"
                  type="number"
                  min="0"
                  step="0.01"
                  className="fs-input"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                />
                <p>
                  Cambio:{' '}
                  {moneda(
                    Number.isFinite(Number(recibido)) ? Math.max(0, Number(recibido) - total) : 0,
                    state.lote.snapshot.currency,
                  )}
                </p>
                <button
                  type="button"
                  className="fs-btn fs-btn--acento"
                  disabled={!items.length || Boolean(errorTicket) || !recibido}
                  onClick={() =>
                    accion(async () => {
                      const ticket = await guardarTicketOffline(userId, items, Number(recibido));
                      setDetalle(ticket);
                      setItems([]);
                      setRecibido('');
                      if (navigator.onLine)
                        void sincronizarOffline(userId).catch((e: unknown) =>
                          setError((e as Error).message),
                        );
                    })
                  }
                >
                  Cobrar y guardar ticket local
                </button>
                <button
                  type="button"
                  className="fs-btn fs-btn--contorno"
                  disabled={!items.length}
                  onClick={() => {
                    setItems([]);
                    setRecibido('');
                  }}
                >
                  Vaciar ticket
                </button>
              </section>
            </div>
          </fieldset>
          <section className="fs-panel fs-pila">
            <h2>Tickets de esta descarga</h2>
            {state.tickets.length === 0 && <p>No hay tickets todavia.</p>}
            {state.tickets.map((t) => (
              <div className="fs-pila" key={t.datos.idempotencyKey}>
                <div className="fs-fila-entre">
                  <span>
                    {fechaHora(t.datos.recordedAt)} ·{' '}
                    {moneda(t.datos.expectedTotal, state.lote.snapshot.currency)} ·{' '}
                    {t.venta ? `Venta #${t.venta.id_venta}` : 'Pendiente de sincronizar'}
                  </span>
                  <button
                    className="fs-btn fs-btn--contorno"
                    type="button"
                    onClick={() => setDetalle(t)}
                  >
                    Ver ticket
                  </button>
                </div>
                {t.error && (
                  <p role="alert">
                    {t.error}{' '}
                    {t.conflicto &&
                      'El ticket sigue guardado. Resuelve el conflicto y pulsa Sincronizar ahora; no vuelvas a cobrarlo.'}
                  </p>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      <Modal
        abierto={Boolean(detalle)}
        titulo="Ticket de caja offline"
        ancho
        onCerrar={() => setDetalle(null)}
      >
        {detalle &&
          (detalle.venta ? (
            <ComprobanteVenta venta={detalle.venta} />
          ) : (
            state && <TicketLocal ticket={detalle} state={state} />
          ))}
      </Modal>
    </>
  );
}
function TicketLocal({ ticket: t, state }: { ticket: TicketOffline; state: CajaOffline }) {
  return (
    <div className="fs-pila">
      <strong>Ticket local: {t.datos.idempotencyKey}</strong>
      <p>Efectivo recibido. Pendiente de sincronizacion y numero de venta del servidor.</p>
      {t.datos.items.map((i) => {
        const v = state.lote.snapshot.variants.find((v) => claveVariante(v) === claveVariante(i));
        return (
          <p key={claveVariante(i)}>
            {i.quantity} × {v?.productName} ({v?.sizeName} / {v?.colorName})
          </p>
        );
      })}
      <p>Total: {moneda(t.datos.expectedTotal, state.lote.snapshot.currency)}</p>
      <p>Cambio: {moneda(t.recibido - t.datos.expectedTotal, state.lote.snapshot.currency)}</p>
    </div>
  );
}
