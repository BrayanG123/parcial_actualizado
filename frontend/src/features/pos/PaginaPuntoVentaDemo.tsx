import { useMemo, useState } from 'react';
import { BadgeStock } from '../../components/ui/Badges';
import { Modal } from '../../components/ui/Modal';
import { Vacio } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProducto, useProductos } from '../../hooks/useCatalogo';
import { useRegistrarVenta } from '../../hooks/useComercio';
import { useDisponibilidad, useSucursales } from '../../hooks/useOperaciones';
import { precioActual, stockDisponible, subtotal, totalLineas } from '../../lib/domain';
import { moneda } from '../../lib/format';
import { CanalVenta, MetodoPago, type Venta } from '../../types/domain';
import { ComprobanteVenta } from '../sales/ComprobanteVenta';

interface LineaTicket {
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
  precio_unitario: number;
  nombre: string;
  talla: string;
  color: string;
}

const METODOS: MetodoPago[] = [MetodoPago.EFECTIVO, MetodoPago.TARJETA, MetodoPago.QR, MetodoPago.TRANSFERENCIA];

export default function PaginaPuntoVenta() {
  const { idSucursal, tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');
  const toast = useToast();

  const [sucursal, setSucursal] = useState<number | ''>(idSucursal ?? '');
  const [busqueda, setBusqueda] = useState('');
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [idTalla, setIdTalla] = useState<number | null>(null);
  const [idColor, setIdColor] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaTicket[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago>(MetodoPago.EFECTIVO);
  const [recibido, setRecibido] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [comprobante, setComprobante] = useState<Venta | null>(null);

  const sucursales = useSucursales();
  const registrar = useRegistrarVenta();
  const resultados = useProductos({ q: busqueda || undefined, page_size: 9, id_sucursal: sucursal || undefined });
  const producto = useProducto(idProducto ?? undefined);
  const disponibilidad = useDisponibilidad(
    idProducto && idTalla && idColor && sucursal
      ? { id_producto: idProducto, id_talla: idTalla, id_color: idColor, id_sucursal: Number(sucursal) }
      : null,
  );

  const disponible = useMemo(
    () => (disponibilidad.data ?? []).reduce((acc, i) => acc + stockDisponible(i), 0),
    [disponibilidad.data],
  );

  const total = totalLineas(lineas);
  const cambio = metodo === MetodoPago.EFECTIVO && recibido !== '' ? Number(recibido) - total : 0;

  function agregar() {
    const p = producto.data;
    if (!sucursal) return setError('Selecciona la sucursal de la caja.');
    if (!p || !idTalla || !idColor) return setError('Selecciona prenda, talla y color.');
    if (disponible < 1) return setError('No hay stock disponible de esa combinacion.');

    setError('');
    setLineas((actuales) => {
      const existente = actuales.find(
        (l) => l.id_producto === p.id_producto && l.id_talla === idTalla && l.id_color === idColor,
      );
      if (existente) {
        return actuales.map((l) =>
          l === existente ? { ...l, cantidad: Math.min(disponible, l.cantidad + 1) } : l,
        );
      }
      return [
        ...actuales,
        {
          id_producto: p.id_producto,
          id_talla: idTalla,
          id_color: idColor,
          cantidad: 1,
          precio_unitario: precioActual(p),
          nombre: p.nombre,
          talla: p.tallas.find((t) => t.id_talla === idTalla)?.nombre ?? '',
          color: p.colores.find((c) => c.id_color === idColor)?.nombre ?? '',
        },
      ];
    });
  }

  function cambiarCantidad(indice: number, delta: number) {
    setLineas((actuales) =>
      actuales
        .map((l, i) => (i === indice ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    );
  }

  async function cobrar() {
    if (lineas.length === 0) return setError('Agrega al menos una prenda al ticket.');
    if (!sucursal) return setError('Selecciona la sucursal de la caja.');
    if (metodo === MetodoPago.EFECTIVO && (recibido === '' || Number(recibido) < total)) {
      return setError('El monto recibido debe cubrir el total de la venta.');
    }

    try {
      const venta = await registrar.mutateAsync({
        canal: CanalVenta.PRESENCIAL,
        id_sucursal: Number(sucursal),
        detalles: lineas.map(({ id_producto, id_talla, id_color, cantidad }) => ({
          id_producto,
          id_talla,
          id_color,
          cantidad,
        })),
        pago: { metodo },
      });
      setComprobante(venta);
      setLineas([]);
      setRecibido('');
      setError('');
      toast.exito('Venta registrada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar la venta.');
    }
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Caja</p>
          <h1>Punto de venta</h1>
          <p className="fs-sub">Registro de ventas presenciales y cobro en caja.</p>
        </div>
        {esAdmin && (
          <div className="fs-campo" style={{ minWidth: 220 }}>
            <label htmlFor="sucursal-caja">Sucursal</label>
            <select
              id="sucursal-caja"
              className="fs-select"
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Selecciona</option>
              {sucursales.data?.map((s) => (
                <option key={s.id_sucursal} value={s.id_sucursal}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {error && <div className="fs-alerta fs-alerta--error">{error}</div>}

      <div className="fs-pos">
        <section className="fs-panel">
          <h3>Buscar prenda</h3>
          <input
            className="fs-input"
            placeholder="Nombre de la prenda"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />

          <div className="fs-pos__resultados">
            {resultados.data?.items.map((p) => (
              <button
                key={p.id_producto}
                type="button"
                className="fs-pos__item"
                onClick={() => {
                  setIdProducto(p.id_producto);
                  setIdTalla(null);
                  setIdColor(null);
                }}
                style={idProducto === p.id_producto ? { borderColor: 'var(--fs-acento)' } : undefined}
              >
                <strong style={{ fontSize: '0.85rem' }}>{p.nombre}</strong>
                <span className="fs-sub">{moneda(precioActual(p))}</span>
              </button>
            ))}
            {resultados.data?.items.length === 0 && (
              <Vacio titulo="Sin resultados" mensaje="Prueba con otro nombre de prenda." />
            )}
          </div>

          {producto.data && (
            <>
              <hr className="fs-divisor" />
              <strong>{producto.data.nombre}</strong>

              <div className="fs-opciones">
                {producto.data.tallas.map((t) => (
                  <button
                    key={t.id_talla}
                    type="button"
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
                    key={c.id_color}
                    type="button"
                    className={`fs-chip fs-chip--color${idColor === c.id_color ? ' fs-chip--activo' : ''}`}
                    onClick={() => setIdColor(c.id_color)}
                  >
                    <span className="fs-punto-color" style={{ background: c.codigo_hex }} />
                    {c.nombre}
                  </button>
                ))}
              </div>

              <div className="fs-fila-wrap">
                {idTalla && idColor && !disponibilidad.isPending && <BadgeStock disponible={disponible} />}
                <button type="button" className="fs-btn fs-btn--acento" onClick={agregar}>
                  Agregar al ticket
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="fs-panel">
          <h3>Ticket</h3>

          {lineas.length === 0 && <p className="fs-sub">Todavia no hay prendas en el ticket.</p>}

          <div className="fs-pila" style={{ gap: 10 }}>
            {lineas.map((l, i) => (
              <div key={`${l.id_producto}-${l.id_talla}-${l.id_color}`} className="fs-fila-entre">
                <div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{l.nombre}</p>
                  <p className="fs-sub">
                    {l.talla} / {l.color} - {moneda(l.precio_unitario)}
                  </p>
                </div>
                <div className="fs-fila" style={{ gap: 8 }}>
                  <div className="fs-cantidad">
                    <button type="button" onClick={() => cambiarCantidad(i, -1)}>
                      -
                    </button>
                    <span>{l.cantidad}</span>
                    <button type="button" onClick={() => cambiarCantidad(i, 1)}>
                      +
                    </button>
                  </div>
                  <strong className="fs-nums">{moneda(subtotal(l.cantidad, l.precio_unitario))}</strong>
                </div>
              </div>
            ))}
          </div>

          <hr className="fs-divisor" />

          <div className="fs-resumen__total">
            <span>Total</span>
            <span className="fs-nums">{moneda(total)}</span>
          </div>

          <div className="fs-campo">
            <label htmlFor="metodo-caja">Metodo de pago</label>
            <select
              id="metodo-caja"
              className="fs-select"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPago)}
            >
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {metodo === MetodoPago.EFECTIVO && (
            <>
              <div className="fs-campo">
                <label htmlFor="recibido">Monto recibido</label>
                <input
                  id="recibido"
                  type="number"
                  min={0}
                  className="fs-input"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="fs-resumen__linea">
                <span>Cambio</span>
                <span className="fs-nums">{cambio > 0 ? moneda(cambio) : moneda(0)}</span>
              </div>
            </>
          )}

          <button
            type="button"
            className="fs-btn fs-btn--acento fs-btn--bloque"
            onClick={cobrar}
            disabled={registrar.isPending || lineas.length === 0}
          >
            {registrar.isPending ? 'Registrando...' : 'Cobrar y finalizar'}
          </button>

          {lineas.length > 0 && (
            <button type="button" className="fs-btn fs-btn--fantasma fs-btn--s" onClick={() => setLineas([])}>
              Vaciar ticket
            </button>
          )}
        </aside>
      </div>

      <Modal
        abierto={comprobante !== null}
        titulo="Venta registrada"
        onCerrar={() => setComprobante(null)}
        ancho
        pie={
          <button type="button" className="fs-btn fs-btn--acento" onClick={() => setComprobante(null)}>
            Nueva venta
          </button>
        }
      >
        {comprobante && <ComprobanteVenta venta={comprobante} />}
      </Modal>
    </>
  );
}
