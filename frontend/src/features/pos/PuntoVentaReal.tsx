import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../../api/config';
import { revisionSesion } from '../../api/sesion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProducto, useProductos } from '../../hooks/useCatalogo';
import { useDisponibilidad } from '../../hooks/useOperaciones';
import { Cargando, ErrorEstado, Vacio } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { BadgeStock } from '../../components/ui/Badges';
import { precioActual, stockDisponible } from '../../lib/domain';
import { fechaHora, moneda } from '../../lib/format';
import { borrarCobro, guardarCobro, recuperarCobro, resultadoIncierto } from '../../lib/pos';
import {
  posService,
  type ClientePOS,
  type CobroPOS,
  type CotizacionPOS,
  type IntentoTarjetaPOS,
  type ItemPOS,
  type MetodoPOS,
  type ReservaPOS,
} from '../../services/pos.service';
import { turnosService, type Turno } from '../../services/turnos.service';
import type { Venta } from '../../types/domain';
import { ComprobanteVenta } from '../sales/ComprobanteVenta';
import { CierreCaja } from './CierreCaja';
import { CobroTarjeta } from './CobroTarjeta';
import { HistorialCaja } from './HistorialCaja';
import { PantallaCajas } from './PantallaCajas';
import { ResumenTurno } from './ResumenTurno';

interface Linea extends ItemPOS {
  productName: string;
  sizeName: string;
  colorName: string;
  limite: number;
}
const METODOS: Record<MetodoPOS, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  QR: 'QR',
  BANK_TRANSFER: 'Transferencia',
};
const clave = (i: ItemPOS) => `${i.productId}:${i.sizeId}:${i.colorId}`;

/* --- Ticket en curso: sobrevive a navegar por el sistema mientras la caja siga abierta --- */
interface TicketGuardado {
  lineas: Linea[];
  cliente: ClientePOS | null;
  reserva: ReservaPOS | null;
}
const claveTicket = (userId: number, shiftId: number) =>
  `fs.pos.ticket.v1:${BASE_URL}:${userId}:${shiftId}`;
function leerTicket(userId: number, shiftId: number): TicketGuardado | null {
  try {
    const raw = localStorage.getItem(claveTicket(userId, shiftId));
    const t = raw ? (JSON.parse(raw) as TicketGuardado) : null;
    return t && Array.isArray(t.lineas) ? t : null;
  } catch {
    return null;
  }
}
function escribirTicket(userId: number, shiftId: number, t: TicketGuardado | null) {
  try {
    if (!t || (!t.lineas.length && !t.cliente && !t.reserva))
      localStorage.removeItem(claveTicket(userId, shiftId));
    else localStorage.setItem(claveTicket(userId, shiftId), JSON.stringify(t));
  } catch {
    /* Sin almacenamiento el ticket solo vive en esta pantalla. */
  }
}

function inicio(userId: number) {
  try {
    return { pendiente: recuperarCobro(userId), error: '' };
  } catch {
    return {
      pendiente: null,
      error:
        'No se pudo leer el registro local de caja. Revisa el historial y habilita el almacenamiento del navegador antes de cobrar.',
    };
  }
}

export default function PuntoVentaReal() {
  const auth = useAuth();
  if (!auth.usuario) return <Cargando texto="Cargando la caja..." />;
  return (
    <Caja
      key={auth.usuario.id_usuario}
      userId={auth.usuario.id_usuario}
      asignada={auth.idSucursal}
      esAdmin={auth.tieneRol('ADMINISTRADOR')}
    />
  );
}

/** Sin caja abierta: lista de cajas. Con caja abierta: venta e historial. */
function Caja({
  userId,
  asignada,
  esAdmin,
}: {
  userId: number;
  asignada: number | null;
  esAdmin: boolean;
}) {
  const [params] = useSearchParams();
  const [sucursal, setSucursal] = useState(
    asignada ?? (esAdmin ? Number(params.get('sucursal')) || 0 : 0),
  );
  const [cerrado, setCerrado] = useState<Turno | null>(null);
  const turno = useQuery({ queryKey: ['turno-actual', userId], queryFn: turnosService.actual });

  if (turno.isPending) return <Cargando texto="Consultando tu caja..." />;
  if (turno.isError) return <ErrorEstado error={turno.error} onReintentar={() => turno.refetch()} />;
  return (
    <>
      {turno.data && !turno.data.closedAt ? (
        turno.data.offlineActive ? (
          <section className="fs-panel fs-pila">
            <h2>Caja en modo offline</h2>
            <p>
              Esta caja tiene ventas offline sin finalizar. Sincroniza y finaliza desde Ventas
              offline antes de volver a la caja normal.
            </p>
            <Link to="/caja/offline" className="fs-btn fs-btn--acento">
              Ir a Ventas offline
            </Link>
          </section>
        ) : (
          <CajaAbierta
            key={turno.data.id}
            userId={userId}
            turno={turno.data}
            onCerrada={setCerrado}
          />
        )
      ) : (
        <PantallaCajas
          userId={userId}
          branchId={sucursal}
          esAdmin={esAdmin}
          onSucursal={setSucursal}
        />
      )}
      <Modal abierto={Boolean(cerrado)} titulo="Caja cerrada" onCerrar={() => setCerrado(null)}>
        {cerrado && <ResumenTurno turno={cerrado} />}
      </Modal>
    </>
  );
}

function CajaAbierta({
  userId,
  turno,
  onCerrada,
}: {
  userId: number;
  turno: Turno;
  onCerrada: (t: Turno) => void;
}) {
  const [params] = useSearchParams();
  const [pestana, setPestana] = useState<'vender' | 'historial'>('vender');
  const [inicial] = useState(() => inicio(userId));
  const [guardado] = useState(() => leerTicket(userId, turno.id));
  const [pendiente, setPendiente] = useState<CobroPOS | null>(inicial.pendiente);
  const sucursal = turno.branchId;
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [idProducto, setIdProducto] = useState<number>();
  const [idTalla, setIdTalla] = useState<number>();
  const [idColor, setIdColor] = useState<number>();
  const [lineas, setLineas] = useState<Linea[]>(guardado?.lineas ?? []);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [cliente, setCliente] = useState<ClientePOS | null>(guardado?.cliente ?? null);
  const [numeroReserva, setNumeroReserva] = useState(params.get('reserva') ?? '');
  const [reserva, setReserva] = useState<ReservaPOS | null>(guardado?.reserva ?? null);
  const [cotizacion, setCotizacion] = useState<CotizacionPOS | null>(null);
  // Una clave por cobro: reintentar o volver a autorizar la tarjeta no duplica la venta.
  const [claveCobro, setClaveCobro] = useState('');
  const [metodo, setMetodo] = useState<MetodoPOS>('CASH');
  const [referencia, setReferencia] = useState('');
  const [recibido, setRecibido] = useState('');
  const [intento, setIntento] = useState<IntentoTarjetaPOS | null>(null);
  const [error, setError] = useState(inicial.error);
  const [ocupado, setOcupado] = useState(false);
  const [comprobante, setComprobante] = useState<Venta | null>(null);
  const lock = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    escribirTicket(userId, turno.id, { lineas, cliente, reserva });
  }, [userId, turno.id, lineas, cliente, reserva]);

  const productos = useProductos({
    q: busqueda || undefined,
    page: pagina,
    page_size: 9,
    id_sucursal: sucursal,
  });
  const producto = useProducto(idProducto);
  const disponibilidad = useDisponibilidad(
    idProducto && idTalla && idColor
      ? { id_producto: idProducto, id_talla: idTalla, id_color: idColor, id_sucursal: sucursal }
      : null,
  );
  const clientes = useQuery({
    queryKey: ['pos-clientes', userId, sucursal, busquedaCliente.trim()],
    queryFn: () => posService.clientes(sucursal, busquedaCliente.trim()),
    enabled: Boolean(busquedaCliente.trim().length >= 2 && !reserva && !pendiente),
  });
  const stock = Math.max(0, ...(disponibilidad.data ?? []).map(stockDisponible));
  const bloqueado = ocupado || Boolean(pendiente) || Boolean(cotizacion) || Boolean(inicial.error);
  const seleccion = {
    branchId: sucursal,
    clientId: cliente?.id,
    reservationId: reserva?.id,
    items: lineas
      .filter((i) => i.quantity > 0)
      .map(({ productId, sizeId, colorId, quantity }) => ({ productId, sizeId, colorId, quantity })),
  };
  const unidades = seleccion.items.reduce((s, i) => s + i.quantity, 0);

  function limpiar() {
    setLineas([]);
    setCliente(null);
    setReserva(null);
    setCotizacion(null);
    setIntento(null);
    setClaveCobro('');
    setIdProducto(undefined);
    setIdTalla(undefined);
    setIdColor(undefined);
    setRecibido('');
    setReferencia('');
    setMetodo('CASH');
    setBusquedaCliente('');
    setNumeroReserva('');
  }
  function agregar() {
    const p = producto.data;
    if (
      !p?.activo ||
      !idTalla ||
      !idColor ||
      disponibilidad.isFetching ||
      disponibilidad.isError ||
      reserva
    )
      return;
    const talla = p.tallas.find((t) => t.id_talla === idTalla);
    const color = p.colores.find((c) => c.id_color === idColor);
    if (!talla || !color) return;
    const item = { productId: p.id_producto, sizeId: idTalla, colorId: idColor, quantity: 1 };
    const anterior = lineas.find((l) => clave(l) === clave(item));
    if (stock <= (anterior?.quantity ?? 0)) {
      setError('No hay mas stock disponible para esa variante en esta sucursal.');
      return;
    }
    if (!anterior && lineas.length >= 50) {
      setError('El ticket admite hasta 50 variantes.');
      return;
    }
    setError('');
    setLineas((ls) =>
      anterior
        ? ls.map((l) =>
            l === anterior
              ? { ...l, quantity: Math.min(100, l.quantity + 1), limite: Math.min(100, stock) }
              : l,
          )
        : [
            ...ls,
            {
              ...item,
              productName: p.nombre,
              sizeName: talla.nombre,
              colorName: color.nombre,
              limite: Math.min(100, stock),
            },
          ],
    );
  }
  function cantidad(i: number, delta: number) {
    setLineas((ls) =>
      ls.map((l, index) =>
        index === i ? { ...l, quantity: Math.max(0, Math.min(l.limite, l.quantity + delta)) } : l,
      ),
    );
  }
  function quitar(i: number) {
    setLineas((ls) => ls.filter((_, index) => index !== i));
  }
  async function cargarReserva() {
    if (lock.current || !Number.isInteger(Number(numeroReserva)) || Number(numeroReserva) < 1)
      return;
    if (lineas.some((l) => l.quantity > 0)) {
      setError('Vacia el ticket antes de cargar una reserva.');
      return;
    }
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      const r = await posService.reserva(Number(numeroReserva), sucursal);
      setReserva(r);
      setCliente(r.client);
      setLineas(r.items.map((i) => ({ ...i, limite: i.quantity })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la reserva.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }
  async function revisar() {
    if (lock.current || !seleccion.items.length) return;
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      setCotizacion(await posService.revisar(seleccion));
      setClaveCobro(crypto.randomUUID());
      setMetodo('CASH');
      setIntento(null);
      setRecibido('');
      setReferencia('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar el ticket.');
      void qc.invalidateQueries({ queryKey: ['disponibilidad'] });
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }
  async function elegirMetodo(m: MetodoPOS) {
    setMetodo(m);
    setError('');
    if (m !== 'CARD' || intento || !cotizacion || lock.current) return;
    lock.current = true;
    setOcupado(true);
    try {
      setIntento(
        await posService.intentoTarjeta({
          ...seleccion,
          shiftId: turno.id,
          idempotencyKey: claveCobro,
          expectedTotal: cotizacion.total,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar el cobro con tarjeta.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }

  /** Registra la venta (descuenta stock, suma al turno) y vacia el ticket. */
  async function registrar(datos: CobroPOS) {
    try {
      guardarCobro(userId, datos);
    } catch {
      setError('No se pudo guardar el cobro en este navegador. Habilita el almacenamiento.');
      return;
    }
    const revision = revisionSesion();
    lock.current = true;
    setOcupado(true);
    setPendiente(datos);
    setError('');
    try {
      const venta =
        datos.paymentMethod === 'CARD'
          ? await posService.cobrarTarjeta({
              branchId: datos.branchId,
              clientId: datos.clientId,
              reservationId: datos.reservationId,
              items: datos.items,
              shiftId: datos.shiftId,
              idempotencyKey: datos.idempotencyKey,
              expectedTotal: datos.expectedTotal,
              paymentIntentId: datos.paymentReference ?? '',
            })
          : await posService.cobrar(datos);
      borrarCobro(userId);
      setPendiente(null);
      limpiar();
      escribirTicket(userId, turno.id, null);
      setComprobante(venta);
      if (revision === revisionSesion()) {
        for (const k of [
          'turno-actual',
          'turnos',
          'ventas',
          'venta',
          'inventario',
          'movimientos',
          'disponibilidad',
          'reservas',
          'reserva',
          'reportes',
          'productos',
          'producto',
        ])
          void qc.invalidateQueries({ queryKey: [k] });
        toast.exito('Venta registrada.');
      }
    } catch (e) {
      if (!resultadoIncierto(e)) {
        borrarCobro(userId);
        setPendiente(null);
        setCotizacion(null);
        setIntento(null);
      }
      setError(e instanceof Error ? e.message : 'No se recibio confirmacion del servidor.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }
  function cobrar() {
    if (lock.current || inicial.error) return;
    if (pendiente) return void registrar(pendiente);
    if (!cotizacion || metodo === 'CARD') return;
    if (
      metodo === 'CASH' &&
      (!/^\d+(\.\d{1,2})?$/.test(recibido) || Number(recibido) < cotizacion.total)
    ) {
      setError('El efectivo recibido debe cubrir el total (hasta dos decimales).');
      return;
    }
    if (metodo !== 'CASH' && !referencia.trim()) {
      setError('Ingresa el numero de operacion del pago.');
      return;
    }
    void registrar({
      ...seleccion,
      shiftId: turno.id,
      expectedTotal: cotizacion.total,
      idempotencyKey: claveCobro,
      paymentMethod: metodo,
      paymentReference: metodo === 'CASH' ? undefined : referencia.trim(),
    });
  }
  function cobrarConTarjeta(paymentIntentId: string) {
    if (!cotizacion) return;
    void registrar({
      ...seleccion,
      shiftId: turno.id,
      expectedTotal: cotizacion.total,
      idempotencyKey: claveCobro,
      paymentMethod: 'CARD',
      paymentReference: paymentIntentId,
    });
  }

  return (
    <div className="fs-pila">
      <header className="fs-panel fs-pos-cabecera">
        <div className="fs-fila-entre" style={{ alignItems: 'flex-start' }}>
          <div className="fs-pila" style={{ gap: 6 }}>
            <span className="fs-pos-etiqueta">
              {turno.branchName} · {turno.registerName}
            </span>
            <h1>Punto de venta</h1>
            <p className="fs-sub">
              Abierta por {turno.cashier} · {fechaHora(turno.openedAt)}
              <br />
              Registra ventas y consulta el historial de esta caja.
            </p>
          </div>
          <div className="fs-fila-wrap">
            <Link to="/caja/offline" className="fs-btn fs-btn--fantasma">
              Ventas offline
            </Link>
            <CierreCaja
              userId={userId}
              turno={turno}
              bloqueado={bloqueado || lineas.some((l) => l.quantity > 0)}
              onCerrada={(t) => {
                escribirTicket(userId, turno.id, null);
                onCerrada(t);
              }}
            />
          </div>
        </div>
        <dl className="fs-pos-kpis">
          <div>
            <dt>Ventas</dt>
            <dd>{turno.saleCount}</dd>
          </div>
          <div>
            <dt>Total vendido</dt>
            <dd>{moneda(turno.totalSales, turno.currency)}</dd>
          </div>
          <div>
            <dt>Efectivo en caja</dt>
            <dd>{moneda(turno.expectedCash, turno.currency)}</dd>
          </div>
          <div>
            <dt>Tarjeta / QR</dt>
            <dd>{moneda(turno.cardTotal + turno.qrTotal + turno.transferTotal, turno.currency)}</dd>
          </div>
        </dl>
      </header>

      <section className="fs-panel fs-pila">
        <div className="fs-pos-pestanas" role="tablist" aria-label="Caja">
          {(
            [
              ['vender', 'Registrar ventas'],
              ['historial', 'Historial de ventas'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={pestana === valor}
              className={`fs-pos-pestana${pestana === valor ? ' fs-pos-pestana--activa' : ''}`}
              onClick={() => setPestana(valor)}
            >
              {texto}
              {valor === 'vender' && unidades > 0 && ` (${unidades})`}
            </button>
          ))}
        </div>

        {pestana === 'historial' ? (
          <HistorialCaja userId={userId} shiftId={turno.id} />
        ) : (
          <>
            {error && !cotizacion && (
              <div role="alert" className="fs-alerta fs-alerta--error">
                {error}
              </div>
            )}
            {pendiente && (
              <section className="fs-alerta fs-pila">
                <strong>Cobro pendiente de confirmacion</strong>
                <p>
                  El ticket por {moneda(pendiente.expectedTotal)} puede haberse registrado.
                  Reintenta para recuperar el resultado sin volver a cobrar al cliente.
                </p>
                <button
                  type="button"
                  className="fs-btn fs-btn--acento"
                  disabled={ocupado}
                  onClick={cobrar}
                >
                  {ocupado ? 'Consultando...' : 'Reintentar confirmacion'}
                </button>
              </section>
            )}
            <fieldset disabled={bloqueado} className="fs-pos-fieldset">
              <div className="fs-pos">
                <section className="fs-pila">
                  {reserva ? (
                    <>
                      <h3>Reserva #{reserva.id}</h3>
                      <p>
                        Ajusta las cantidades que el cliente compra. Al cobrar se liberan las
                        prendas restantes.
                      </p>
                      <p className="fs-sub">
                        Si no compra ninguna prenda, cierra la atencion desde Reservas.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3>Buscar prenda</h3>
                      <input
                        aria-label="Buscar prenda"
                        className="fs-input"
                        value={busqueda}
                        onChange={(e) => {
                          setBusqueda(e.target.value);
                          setPagina(1);
                        }}
                        placeholder="Nombre de la prenda"
                      />
                      {productos.isPending && <p>Cargando prendas...</p>}
                      {productos.isError && (
                        <ErrorEstado error={productos.error} onReintentar={() => productos.refetch()} />
                      )}
                      <div className="fs-pos__resultados">
                        {productos.data?.items.map((p) => (
                          <button
                            type="button"
                            key={p.id_producto}
                            className={`fs-pos__item${idProducto === p.id_producto ? ' fs-pos__item--activo' : ''}`}
                            onClick={() => {
                              setIdProducto(p.id_producto);
                              setIdTalla(undefined);
                              setIdColor(undefined);
                            }}
                          >
                            <strong>{p.nombre}</strong>
                            <span>
                              {moneda(
                                cliente?.wholesale && p.precio_mayorista != null
                                  ? p.precio_mayorista
                                  : precioActual(p),
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      {productos.data?.items.length === 0 && (
                        <Vacio titulo="Sin prendas" mensaje="Prueba con otro nombre." />
                      )}
                      {productos.data && productos.data.total > 9 && (
                        <div className="fs-fila-wrap">
                          <button
                            type="button"
                            className="fs-btn fs-btn--contorno"
                            disabled={pagina <= 1}
                            onClick={() => setPagina(pagina - 1)}
                          >
                            Anterior
                          </button>
                          <span>
                            Pagina {pagina} de {Math.ceil(productos.data.total / 9)}
                          </span>
                          <button
                            type="button"
                            className="fs-btn fs-btn--contorno"
                            disabled={pagina * 9 >= productos.data.total}
                            onClick={() => setPagina(pagina + 1)}
                          >
                            Siguiente
                          </button>
                        </div>
                      )}
                      {idProducto && producto.isPending && <p>Cargando tallas y colores...</p>}
                      {producto.isError && (
                        <ErrorEstado error={producto.error} onReintentar={() => producto.refetch()} />
                      )}
                      {producto.data && (
                        <div className="fs-pila fs-pos-variante">
                          <strong>{producto.data.nombre}</strong>
                          <span className="fs-sub">Talla</span>
                          <div className="fs-opciones">
                            {producto.data.tallas.map((t) => (
                              <button
                                type="button"
                                key={t.id_talla}
                                className={`fs-chip${idTalla === t.id_talla ? ' fs-chip--activo' : ''}`}
                                onClick={() => setIdTalla(t.id_talla)}
                              >
                                {t.nombre}
                              </button>
                            ))}
                          </div>
                          <span className="fs-sub">Color</span>
                          <div className="fs-opciones">
                            {producto.data.colores.map((c) => (
                              <button
                                type="button"
                                key={c.id_color}
                                className={`fs-chip${idColor === c.id_color ? ' fs-chip--activo' : ''}`}
                                onClick={() => setIdColor(c.id_color)}
                              >
                                {c.nombre}
                              </button>
                            ))}
                          </div>
                          {disponibilidad.isFetching && <p>Consultando stock...</p>}
                          {disponibilidad.isError && (
                            <ErrorEstado
                              error={disponibilidad.error}
                              onReintentar={() => disponibilidad.refetch()}
                            />
                          )}
                          {idTalla &&
                            idColor &&
                            !disponibilidad.isFetching &&
                            !disponibilidad.isError && (
                              <p>
                                <BadgeStock disponible={stock} /> {stock} disponibles en esta
                                sucursal
                              </p>
                            )}
                          <button
                            type="button"
                            className="fs-btn fs-btn--acento"
                            disabled={
                              !idTalla ||
                              !idColor ||
                              stock < 1 ||
                              disponibilidad.isFetching ||
                              disponibilidad.isError
                            }
                            onClick={agregar}
                          >
                            Agregar al ticket
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>

                <aside className="fs-pila fs-pos-ticket">
                  <h3>Ticket</h3>
                  <div className="fs-campo">
                    <label htmlFor="cliente-pos">Cliente (opcional)</label>
                    {cliente ? (
                      <div className="fs-fila-entre">
                        <span>
                          {cliente.name} · {cliente.wholesale ? 'Mayorista' : 'Minorista'}
                        </span>
                        {!reserva && (
                          <button
                            type="button"
                            className="fs-btn fs-btn--fantasma"
                            onClick={() => setCliente(null)}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <input
                          id="cliente-pos"
                          className="fs-input"
                          placeholder="Nombre o correo (minimo 2 letras)"
                          value={busquedaCliente}
                          onChange={(e) => setBusquedaCliente(e.target.value)}
                        />
                        {clientes.isFetching && <span className="fs-sub">Buscando...</span>}
                        {busquedaCliente.trim().length >= 2 &&
                          clientes.data?.map((c) => (
                            <button
                              type="button"
                              className="fs-btn fs-btn--contorno"
                              key={c.id}
                              onClick={() => {
                                setCliente(c);
                                setBusquedaCliente('');
                              }}
                            >
                              {c.name} · {c.email}
                              {c.wholesale && ' · Mayorista'}
                            </button>
                          ))}
                        {busquedaCliente.trim().length >= 2 && clientes.data?.length === 0 && (
                          <span className="fs-sub">No se encontraron clientes.</span>
                        )}
                        {!busquedaCliente && (
                          <span className="fs-sub">Consumidor final · precio minorista</span>
                        )}
                      </>
                    )}
                  </div>
                  {!reserva && (
                    <details>
                      <summary>Cobrar una reserva</summary>
                      <div className="fs-fila-wrap" style={{ marginTop: 8 }}>
                        <input
                          aria-label="Numero de reserva"
                          type="number"
                          min="1"
                          className="fs-input"
                          placeholder="N.º de reserva"
                          value={numeroReserva}
                          onChange={(e) => setNumeroReserva(e.target.value)}
                        />
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno"
                          disabled={!numeroReserva}
                          onClick={cargarReserva}
                        >
                          Cargar
                        </button>
                      </div>
                    </details>
                  )}
                  {lineas.length === 0 && <p className="fs-sub">Todavia no hay prendas.</p>}
                  {lineas.map((l, i) => (
                    <div key={clave(l)} className="fs-fila-entre fs-pos-linea">
                      <div>
                        <strong>{l.productName}</strong>
                        <p className="fs-sub">
                          {l.sizeName} / {l.colorName}
                          {reserva && ` · Reservadas: ${l.limite}`}
                        </p>
                      </div>
                      <div className="fs-fila-wrap">
                        <div className="fs-cantidad">
                          <button
                            type="button"
                            aria-label={`Restar ${l.productName} ${l.sizeName}`}
                            disabled={l.quantity <= 0}
                            onClick={() => cantidad(i, -1)}
                          >
                            -
                          </button>
                          <span>{l.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Sumar ${l.productName} ${l.sizeName}`}
                            disabled={l.quantity >= l.limite}
                            onClick={() => cantidad(i, 1)}
                          >
                            +
                          </button>
                        </div>
                        {!reserva && (
                          <button
                            type="button"
                            className="fs-btn fs-btn--fantasma"
                            aria-label={`Quitar ${l.productName} ${l.sizeName}`}
                            onClick={() => quitar(i)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="fs-sub">
                    {unidades} {unidades === 1 ? 'prenda' : 'prendas'}. El total se calcula con los
                    precios vigentes al cobrar.
                  </p>
                  <button
                    type="button"
                    className="fs-btn fs-btn--acento"
                    disabled={!seleccion.items.length}
                    onClick={revisar}
                  >
                    Cobrar
                  </button>
                  {(lineas.length > 0 || cliente || reserva) && (
                    <button
                      type="button"
                      className="fs-btn fs-btn--fantasma"
                      onClick={() => {
                        limpiar();
                        setError('');
                      }}
                    >
                      Vaciar ticket
                    </button>
                  )}
                </aside>
              </div>
            </fieldset>
          </>
        )}
      </section>

      <Modal
        abierto={Boolean(cotizacion) && !pendiente}
        titulo="Cobrar venta"
        ancho
        onCerrar={() => {
          if (!ocupado) {
            setCotizacion(null);
            setIntento(null);
            setError('');
          }
        }}
        pie={
          <>
            <button
              type="button"
              disabled={ocupado}
              className="fs-btn fs-btn--contorno"
              onClick={() => {
                setCotizacion(null);
                setIntento(null);
                setError('');
              }}
            >
              Volver al ticket
            </button>
            {metodo !== 'CARD' && (
              <button
                type="button"
                disabled={ocupado}
                className="fs-btn fs-btn--acento"
                onClick={cobrar}
              >
                {ocupado ? 'Registrando...' : 'Confirmar pago'}
              </button>
            )}
          </>
        }
      >
        {cotizacion && (
          <div className="fs-pila">
            {error && (
              <p role="alert" className="fs-campo-error">
                {error}
              </p>
            )}
            <p>
              {cliente?.name ?? 'Consumidor final'} ·{' '}
              {cotizacion.wholesale ? 'Cliente mayorista' : 'Cliente minorista'}
            </p>
            {cotizacion.items.map((i) => (
              <div className="fs-fila-entre" key={clave(i)}>
                <span>
                  {i.quantity} × {i.productName} ({i.sizeName} / {i.colorName}) ·{' '}
                  {moneda(i.netUnitPrice, cotizacion.currency)}
                </span>
                <strong>{moneda(i.subtotal, cotizacion.currency)}</strong>
              </div>
            ))}
            <h3>Total: {moneda(cotizacion.total, cotizacion.currency)}</h3>
            <div className="fs-campo">
              <span className="fs-sub">Metodo de pago</span>
              <div className="fs-opciones" role="radiogroup" aria-label="Metodo de pago">
                {(Object.entries(METODOS) as [MetodoPOS, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={metodo === value}
                    className={`fs-chip${metodo === value ? ' fs-chip--activo' : ''}`}
                    disabled={ocupado}
                    onClick={() => void elegirMetodo(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {metodo === 'CASH' && (
              <div className="fs-campo">
                <label htmlFor="recibido">Efectivo recibido</label>
                <input
                  id="recibido"
                  className="fs-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  autoFocus
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  disabled={ocupado}
                />
                <p>
                  Cambio:{' '}
                  <strong>
                    {moneda(
                      Number.isFinite(Number(recibido))
                        ? Math.max(0, Number(recibido) - cotizacion.total)
                        : 0,
                      cotizacion.currency,
                    )}
                  </strong>
                </p>
              </div>
            )}
            {(metodo === 'QR' || metodo === 'BANK_TRANSFER') && (
              <div className="fs-campo">
                <label htmlFor="referencia-caja">Numero de operacion</label>
                <input
                  id="referencia-caja"
                  className="fs-input"
                  maxLength={175}
                  autoComplete="off"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  disabled={ocupado}
                />
                <p className="fs-sub">
                  Verifica en la app del banco que el pago llego antes de confirmarlo.
                </p>
              </div>
            )}
            {metodo === 'CARD' &&
              (intento ? (
                <CobroTarjeta
                  intento={intento}
                  deshabilitado={ocupado}
                  onAutorizado={cobrarConTarjeta}
                />
              ) : (
                <p className="fs-sub">{ocupado ? 'Preparando el cobro con tarjeta...' : ''}</p>
              ))}
            {reserva && (
              <p>Al cobrar se cerrara la reserva y se liberaran las prendas no compradas.</p>
            )}
          </div>
        )}
      </Modal>
      <Modal
        abierto={Boolean(comprobante)}
        titulo="Venta registrada"
        ancho
        onCerrar={() => setComprobante(null)}
        pie={
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            onClick={() => setComprobante(null)}
          >
            Nueva venta
          </button>
        }
      >
        {comprobante && <ComprobanteVenta venta={comprobante} />}
      </Modal>
    </div>
  );
}
