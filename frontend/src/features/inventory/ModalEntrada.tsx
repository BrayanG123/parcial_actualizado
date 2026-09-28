import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { ErrorEstado } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProducto, useProductos } from '../../hooks/useCatalogo';
import { useEntradaInventario, useSucursales } from '../../hooks/useOperaciones';

export function ModalEntrada({ onCerrar }: { onCerrar: () => void }) {
  const { idSucursal, tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');
  const [sucursal, setSucursal] = useState(esAdmin ? '' : String(idSucursal ?? ''));
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [producto, setProducto] = useState('');
  const [talla, setTalla] = useState('');
  const [color, setColor] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [pendiente, setPendiente] = useState(false);
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState('');
  const sucursales = useSucursales();
  const productos = useProductos({ q: q || undefined, page, page_size: 20 });
  const detalle = useProducto(producto ? Number(producto) : undefined);
  const registrar = useEntradaInventario();
  const toast = useToast();
  async function enviar() {
    if (!sucursales.data?.some((s) => s.id_sucursal === Number(sucursal)))
      return setError('Selecciona una sucursal activa.');
    if (
      !detalle.data?.activo ||
      !detalle.data.tallas.some((t) => t.id_talla === Number(talla)) ||
      !detalle.data.colores.some((c) => c.id_color === Number(color))
    )
      return setError('Selecciona producto, talla y color validos.');
    if (!Number.isInteger(cantidad) || cantidad < 1)
      return setError('Ingresa una cantidad entera mayor a cero.');
    if (
      pendiente &&
      (!fecha || !Number.isFinite(Date.parse(fecha)) || Date.parse(fecha) <= Date.now())
    )
      return setError('Indica una fecha y hora futura.');
    try {
      await registrar.mutateAsync({
        id_sucursal: Number(sucursal),
        id_producto: Number(producto),
        id_talla: Number(talla),
        id_color: Number(color),
        cantidad,
        pendiente,
        fecha_programada: pendiente ? new Date(fecha).toISOString() : undefined,
        referencia,
        observacion,
      });
      toast.exito(
        pendiente
          ? 'Ingreso programado. Confirma su recepcion desde Movimientos cuando llegue.'
          : 'Mercaderia recibida. Inventario actualizado.',
      );
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar la entrada.');
    }
  }
  return (
    <Modal
      abierto
      titulo="Entrada de mercaderia"
      onCerrar={() => !registrar.isPending && onCerrar()}
      pie={
        <button
          type="button"
          className="fs-btn fs-btn--acento"
          onClick={enviar}
          disabled={registrar.isPending || !detalle.data || sucursales.isError}
        >
          {registrar.isPending ? 'Guardando...' : 'Registrar entrada'}
        </button>
      }
    >
      <div className="fs-pila">
        {error && (
          <p className="fs-alerta fs-alerta--error" role="alert">
            {error}
          </p>
        )}
        {sucursales.isError && (
          <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />
        )}
        <div className="fs-campo">
          <label htmlFor="entrada-sucursal">Sucursal</label>
          <select
            id="entrada-sucursal"
            className="fs-select"
            value={sucursal}
            disabled={!esAdmin}
            onChange={(e) => setSucursal(e.target.value)}
          >
            <option value="">Selecciona</option>
            {sucursales.data?.map((s) => (
              <option key={s.id_sucursal} value={s.id_sucursal}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <form
          className="fs-campo"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(busqueda.trim());
            setPage(1);
            setProducto('');
            setTalla('');
            setColor('');
          }}
        >
          <label htmlFor="entrada-busqueda">Buscar producto</label>
          <input
            id="entrada-busqueda"
            className="fs-input"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button className="fs-btn fs-btn--contorno" type="submit">
            Buscar
          </button>
        </form>
        {productos.isPending && <p>Cargando productos...</p>}
        {productos.isError && (
          <ErrorEstado error={productos.error} onReintentar={() => productos.refetch()} />
        )}
        <div className="fs-campo">
          <label htmlFor="entrada-producto">Producto</label>
          <select
            id="entrada-producto"
            className="fs-select"
            value={producto}
            onChange={(e) => {
              setProducto(e.target.value);
              setTalla('');
              setColor('');
            }}
          >
            <option value="">Selecciona</option>
            {productos.data?.items.map((p) => (
              <option key={p.id_producto} value={p.id_producto}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        {productos.data && productos.data.total > 20 && (
          <div className="fs-fila-wrap">
            <button
              className="fs-btn fs-btn--contorno"
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                setProducto('');
                setTalla('');
                setColor('');
              }}
            >
              Anteriores
            </button>
            <span>Pagina {page}</span>
            <button
              className="fs-btn fs-btn--contorno"
              disabled={page * 20 >= productos.data.total}
              onClick={() => {
                setPage(page + 1);
                setProducto('');
                setTalla('');
                setColor('');
              }}
            >
              Siguientes
            </button>
          </div>
        )}
        {detalle.isError && (
          <ErrorEstado error={detalle.error} onReintentar={() => detalle.refetch()} />
        )}
        <div className="fs-rejilla-form">
          <div className="fs-campo">
            <label htmlFor="entrada-talla">Talla</label>
            <select
              id="entrada-talla"
              className="fs-select"
              value={talla}
              disabled={!detalle.data}
              onChange={(e) => setTalla(e.target.value)}
            >
              <option value="">Selecciona</option>
              {detalle.data?.tallas.map((t) => (
                <option key={t.id_talla} value={t.id_talla}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="fs-campo">
            <label htmlFor="entrada-color">Color</label>
            <select
              id="entrada-color"
              className="fs-select"
              value={color}
              disabled={!detalle.data}
              onChange={(e) => setColor(e.target.value)}
            >
              <option value="">Selecciona</option>
              {detalle.data?.colores.map((c) => (
                <option key={c.id_color} value={c.id_color}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="fs-campo">
            <label htmlFor="entrada-cantidad">Cantidad</label>
            <input
              id="entrada-cantidad"
              type="number"
              min={1}
              step={1}
              className="fs-input"
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
            />
          </div>
        </div>
        <label className="fs-check">
          <input
            type="checkbox"
            checked={pendiente}
            onChange={(e) => setPendiente(e.target.checked)}
          />
          Ingreso programado (aun no recibido)
        </label>
        {pendiente && (
          <div className="fs-campo">
            <label htmlFor="entrada-fecha">Fecha y hora prevista</label>
            <input
              id="entrada-fecha"
              type="datetime-local"
              className="fs-input"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <span className="fs-campo-ayuda">
              La cantidad disponible aumenta al confirmar la recepcion.
            </span>
          </div>
        )}
        <div className="fs-campo">
          <label htmlFor="entrada-referencia">Referencia</label>
          <input
            id="entrada-referencia"
            className="fs-input"
            maxLength={150}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </div>
        <div className="fs-campo">
          <label htmlFor="entrada-observacion">Observacion</label>
          <textarea
            id="entrada-observacion"
            className="fs-textarea"
            maxLength={500}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
