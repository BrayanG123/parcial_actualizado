import { PanelTurno } from './PanelTurno';
import { turnosService } from '../../services/turnos.service';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { revisionSesion } from '../../api/sesion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProducto, useProductos } from '../../hooks/useCatalogo';
import { useDisponibilidad, useSucursales } from '../../hooks/useOperaciones';
import { Cargando, ErrorEstado, Vacio } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { BadgeStock } from '../../components/ui/Badges';
import { precioActual, stockDisponible } from '../../lib/domain';
import { moneda } from '../../lib/format';
import { borrarCobro, guardarCobro, recuperarCobro, resultadoIncierto } from '../../lib/pos';
import {
  posService,
  type ClientePOS,
  type CobroPOS,
  type CotizacionPOS,
  type ItemPOS,
  type MetodoPOS,
  type ReservaPOS,
} from '../../services/pos.service';
import type { Venta } from '../../types/domain';
import { ComprobanteVenta } from '../sales/ComprobanteVenta';

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
  const [inicial] = useState(() => inicio(userId));
  const [pendiente, setPendiente] = useState<CobroPOS | null>(inicial.pendiente);
  const [sucursalElegida, setSucursal] = useState(
    inicial.pendiente?.branchId ?? asignada ?? (esAdmin ? Number(params.get('sucursal')) || 0 : 0),
  );
  const turno = useQuery({ queryKey: ['turno-actual', userId], queryFn: turnosService.actual });
  const sucursal = turno.data?.branchId ?? sucursalElegida;
  const [ocupadoTurno, setOcupadoTurno] = useState(false);
  const puedeVender = Boolean(
    turno.data &&
    !turno.data.offlineActive &&
    !turno.data.closedAt &&
    !turno.isFetching &&
    !turno.isError &&
    !ocupadoTurno,
  );
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [idProducto, setIdProducto] = useState<number>();
  const [idTalla, setIdTalla] = useState<number>();
  const [idColor, setIdColor] = useState<number>();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [cliente, setCliente] = useState<ClientePOS | null>(null);
  const [numeroReserva, setNumeroReserva] = useState(params.get('reserva') ?? '');
  const [reserva, setReserva] = useState<ReservaPOS | null>(null);
  const [cotizacion, setCotizacion] = useState<CotizacionPOS | null>(null);
  const [metodo, setMetodo] = useState<MetodoPOS>('CASH');
  const [referencia, setReferencia] = useState('');
  const [recibido, setRecibido] = useState('');
  const [error, setError] = useState(inicial.error);
  const [ocupado, setOcupado] = useState(false);
  const [comprobante, setComprobante] = useState<Venta | null>(null);
  const lock = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();
  const sucursales = useSucursales();
  const productos = useProductos({
    q: busqueda || undefined,
    page: pagina,
    page_size: 9,
    id_sucursal: sucursal || undefined,
  });
  const producto = useProducto(idProducto);
  const disponibilidad = useDisponibilidad(
    idProducto && idTalla && idColor && sucursal
      ? { id_producto: idProducto, id_talla: idTalla, id_color: idColor, id_sucursal: sucursal }
      : null,
  );
  const clientes = useQuery({
    queryKey: ['pos-clientes', userId, sucursal, busquedaCliente.trim()],
    queryFn: () => posService.clientes(sucursal, busquedaCliente.trim()),
    enabled: Boolean(sucursal && busquedaCliente.trim().length >= 2 && !reserva && !pendiente),
  });
  const stock = Math.max(0, ...(disponibilidad.data ?? []).map(stockDisponible));
  const bloqueado =
    ocupadoTurno || ocupado || Boolean(pendiente) || Boolean(cotizacion) || Boolean(inicial.error);
  const seleccion = {
    branchId: sucursal,
    clientId: cliente?.id,
    reservationId: reserva?.id,
    items: lineas
      .filter((i) => i.quantity > 0)
      .map(({ productId, sizeId, colorId, quantity }) => ({
        productId,
        sizeId,
        colorId,
        quantity,
      })),
  };
  function limpiar() {
    setLineas([]);
    setCliente(null);
    setReserva(null);
    setCotizacion(null);
    setIdProducto(undefined);
    setIdTalla(undefined);
    setIdColor(undefined);
    setRecibido('');
    setReferencia('');
    setBusquedaCliente('');
    setNumeroReserva('');
  }
  function agregar() {
    const p = producto.data;
    if (
      !puedeVender ||
      !sucursal ||
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
      setError('No hay mas stock disponible para esa variante.');
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
  async function cargarReserva() {
    if (
      lock.current ||
      !Number.isInteger(Number(numeroReserva)) ||
      Number(numeroReserva) < 1 ||
      !sucursal
    )
      return;
    if (lineas.some((l) => l.quantity > 0)) {
      setError('Vacia el ticket antes de cargar otra reserva.');
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
    if (lock.current || !puedeVender || !sucursal || !seleccion.items.length) return;
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      setCotizacion(await posService.revisar(seleccion));
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
  async function cobrar() {
    if (lock.current || inicial.error) return;
    let datos = pendiente;
    if (!datos) {
      if (!cotizacion || !puedeVender || !turno.data) return;
      if (
        metodo === 'CASH' &&
        (!/^\d+(\.\d{1,2})?$/.test(recibido) ||
          !Number.isFinite(Number(recibido)) ||
          Number(recibido) < cotizacion.total)
      ) {
        setError('El efectivo recibido debe cubrir el total y tener hasta dos decimales.');
        return;
      }
      if (metodo !== 'CASH' && !referencia.trim()) {
        setError('Ingresa la referencia del pago realizado.');
        return;
      }
      datos = {
        ...seleccion,
        shiftId: turno.data.id,
        expectedTotal: cotizacion.total,
        idempotencyKey: crypto.randomUUID(),
        paymentMethod: metodo,
        paymentReference: metodo === 'CASH' ? undefined : referencia.trim(),
      };
    }
    try {
      guardarCobro(userId, datos);
    } catch {
      setError(
        'No se pudo guardar el ticket en este navegador. Habilita el almacenamiento antes de cobrar.',
      );
      return;
    }
    const revision = revisionSesion();
    lock.current = true;
    setOcupado(true);
    setPendiente(datos);
    setError('');
    try {
      const venta = await posService.cobrar(datos);
      borrarCobro(userId);
      setPendiente(null);
      setComprobante(venta);
      limpiar();
      if (revision === revisionSesion()) {
        for (const k of [
          'turno-actual',
          'turnos',
          'ventas',
          'venta',
          'inventario',
          'movimientos',
          'disponibilidad',
          'carrito',
          'reservas',
          'reserva',
          'reportes',
          'productos',
        ])
          void qc.invalidateQueries({ queryKey: [k] });
        toast.exito('Venta registrada.');
      }
    } catch (e) {
      if (!resultadoIncierto(e)) {
        borrarCobro(userId);
        setPendiente(null);
        setCotizacion(null);
      }
      setError(e instanceof Error ? e.message : 'No se recibio confirmacion del servidor.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Caja</p>
          <h1>Punto de venta</h1>
          <p className="fs-sub">Selecciona prendas, revisa el total y confirma el cobro.</p>
        </div>
        <Link to="/caja/ventas" className="fs-btn fs-btn--contorno">
          Historial de ventas
        </Link>
      </header>
      <Link to="/caja/offline" className="fs-btn fs-btn--contorno">
        Ventas offline
      </Link>
      {turno.data?.offlineActive && (
        <p>
          Este turno tiene modo offline activo. Sincroniza y finaliza desde Ventas offline antes de
          volver a la caja normal.
        </p>
      )}
      {turno.isPending && <p>Cargando turno de caja...</p>}
      {turno.isError && <ErrorEstado error={turno.error} onReintentar={() => turno.refetch()} />}
      {!turno.isPending && !turno.isError && (
        <PanelTurno
          key={`${userId}:${sucursal}`}
          userId={userId}
          branchId={sucursal}
          turno={turno.data ?? null}
          esAdmin={esAdmin}
          impedirCierre={
            Boolean(turno.data?.offlineActive) ||
            ocupado ||
            Boolean(pendiente) ||
            Boolean(cotizacion) ||
            lineas.some((l) => l.quantity > 0)
          }
          onBloquear={setOcupadoTurno}
          onSucursal={setSucursal}
        />
      )}
      {error && (
        <div role="alert" className="fs-alerta fs-alerta--error">
          {error}
        </div>
      )}
      {pendiente && (
        <section className="fs-panel fs-pila">
          <h3>Cobro pendiente de confirmacion</h3>
          <p>
            El ticket por {moneda(pendiente.expectedTotal)} puede haber sido registrado. Reintenta
            para recuperar el resultado sin volver a cobrar al cliente.
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
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className="fs-panel fs-pila" style={{ marginBottom: 20 }}>
          {esAdmin ? (
            <div className="fs-campo">
              <label htmlFor="sucursal-caja">Sucursal</label>
              <select
                id="sucursal-caja"
                disabled={Boolean(turno.data)}
                className="fs-select"
                value={sucursal || ''}
                onChange={(e) => {
                  limpiar();
                  setSucursal(Number(e.target.value));
                  setPagina(1);
                  setError('');
                }}
              >
                <option value="">Selecciona una sucursal</option>
                {sucursales.data?.map((s) => (
                  <option key={s.id_sucursal} value={s.id_sucursal}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p>
              Sucursal:{' '}
              {sucursales.data?.find((s) => s.id_sucursal === sucursal)?.nombre ??
                asignada ??
                'Sin asignar'}
            </p>
          )}
          {sucursales.isError && (
            <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />
          )}
          <div className="fs-rejilla-form">
            <div className="fs-campo">
              <label htmlFor="cliente-pos">Buscar cliente (opcional)</label>
              <input
                id="cliente-pos"
                className="fs-input"
                placeholder="Nombre o correo, minimo 2 caracteres"
                value={busquedaCliente}
                disabled={Boolean(reserva) || !sucursal}
                onChange={(e) => setBusquedaCliente(e.target.value)}
              />
              <p className="fs-sub">
                {cliente
                  ? `${cliente.name} · ${cliente.wholesale ? 'Mayorista' : 'Minorista'}`
                  : 'Consumidor final · precio minorista'}
              </p>
              {cliente && !reserva && (
                <button
                  type="button"
                  className="fs-btn fs-btn--fantasma"
                  onClick={() => {
                    setCliente(null);
                    setBusquedaCliente('');
                  }}
                >
                  Quitar cliente
                </button>
              )}
              {clientes.isFetching && <p>Buscando clientes...</p>}
              {clientes.isError && (
                <ErrorEstado error={clientes.error} onReintentar={() => clientes.refetch()} />
              )}
              {!reserva &&
                busquedaCliente.trim().length >= 2 &&
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
                <span>No se encontraron clientes.</span>
              )}
            </div>
            <div className="fs-campo">
              <label htmlFor="reserva-pos">Numero de reserva</label>
              <input
                id="reserva-pos"
                type="number"
                min="1"
                className="fs-input"
                value={numeroReserva}
                onChange={(e) => setNumeroReserva(e.target.value)}
                disabled={Boolean(reserva) || !sucursal}
              />
              <button
                type="button"
                className="fs-btn fs-btn--contorno"
                disabled={!puedeVender || !sucursal || !numeroReserva || Boolean(reserva)}
                onClick={cargarReserva}
              >
                Cargar reserva
              </button>
              <span className="fs-sub">
                La sucursal debe haber marcado al cliente como presente.
              </span>
            </div>
          </div>
        </section>
        <div className="fs-pos">
          <section className="fs-panel fs-pila">
            {reserva ? (
              <>
                <h3>Reserva #{reserva.id}</h3>
                <p>
                  Selecciona las cantidades que el cliente compra. Al finalizar se liberaran las
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
                  disabled={!sucursal}
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
                      className="fs-pos__item"
                      disabled={!sucursal}
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
                  <Vacio
                    titulo="Sin prendas disponibles"
                    mensaje="Prueba otra busqueda o sucursal."
                  />
                )}
                {productos.data && (
                  <div className="fs-fila-wrap">
                    <button
                      type="button"
                      className="fs-btn fs-btn--contorno"
                      disabled={pagina <= 1}
                      onClick={() => setPagina(pagina - 1)}
                    >
                      Anterior
                    </button>
                    <span>Pagina {pagina}</span>
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
                {idProducto && producto.isPending && <p>Cargando variantes...</p>}
                {producto.isError && (
                  <ErrorEstado error={producto.error} onReintentar={() => producto.refetch()} />
                )}
                {producto.data && (
                  <>
                    <strong>{producto.data.nombre}</strong>
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
                      !disponibilidad.isError && <BadgeStock disponible={stock} />}
                    <button
                      type="button"
                      className="fs-btn fs-btn--acento"
                      disabled={
                        !puedeVender ||
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
                  </>
                )}
              </>
            )}
          </section>
          <aside className="fs-panel fs-pila">
            <h3>Ticket</h3>
            {lineas.length === 0 && <p className="fs-sub">Todavia no hay prendas.</p>}
            {lineas.map((l, i) => (
              <div key={clave(l)} className="fs-fila-entre">
                <div>
                  <strong>{l.productName}</strong>
                  <p className="fs-sub">
                    {l.sizeName} / {l.colorName}
                    {reserva && ` · Reservadas: ${l.limite}`}
                  </p>
                </div>
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
              </div>
            ))}
            <p className="fs-sub">
              El total se calcula con los precios vigentes al revisar el ticket.
            </p>
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={!puedeVender || !sucursal || !seleccion.items.length}
              onClick={revisar}
            >
              Revisar total
            </button>
            {lineas.length > 0 && (
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
      <Modal
        abierto={Boolean(cotizacion) && !pendiente}
        titulo="Confirmar cobro"
        ancho
        onCerrar={() => {
          if (!ocupado) {
            setCotizacion(null);
            setError('');
          }
        }}
        pie={
          <>
            <button
              type="button"
              disabled={ocupado}
              className="fs-btn fs-btn--contorno"
              onClick={() => setCotizacion(null)}
            >
              Volver al ticket
            </button>
            <button
              type="button"
              disabled={ocupado}
              className="fs-btn fs-btn--acento"
              onClick={cobrar}
            >
              Cobrar y finalizar
            </button>
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
              <label htmlFor="metodo-caja">Metodo de pago</label>
              <select
                id="metodo-caja"
                className="fs-select"
                value={metodo}
                onChange={(e) => {
                  setMetodo(e.target.value as MetodoPOS);
                  setError('');
                }}
                disabled={ocupado}
              >
                {Object.entries(METODOS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {metodo === 'CASH' ? (
              <div className="fs-campo">
                <label htmlFor="recibido">Efectivo recibido</label>
                <input
                  id="recibido"
                  className="fs-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  disabled={ocupado}
                />
                <p>
                  Cambio:{' '}
                  {moneda(
                    Number.isFinite(Number(recibido))
                      ? Math.max(0, Number(recibido) - cotizacion.total)
                      : 0,
                    cotizacion.currency,
                  )}
                </p>
              </div>
            ) : (
              <div className="fs-campo">
                <label htmlFor="referencia-caja">Referencia del pago</label>
                <input
                  id="referencia-caja"
                  className="fs-input"
                  maxLength={175}
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  disabled={ocupado}
                />
                <p className="fs-sub">
                  Confirma que el pago se realizo en el banco o terminal antes de registrarlo.
                </p>
              </div>
            )}
            {reserva && (
              <p>Al confirmar se cerrara la reserva y se liberaran las prendas no compradas.</p>
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
    </>
  );
}
