import { ErrorEstado } from '../../components/ui/Estados';
import { Paginacion } from '../../components/ui/Paginacion';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BadgeStock } from '../../components/ui/Badges';
import { ImagenProducto } from '../../components/ui/ImagenProducto';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProducto, useProductos } from '../../hooks/useCatalogo';
import { useCrearReserva } from '../../hooks/useComercio';
import { useDisponibilidad, useSucursales } from '../../hooks/useOperaciones';
import { stockDisponible } from '../../lib/domain';
import type { LineaSeleccion } from '../../services/comercio.service';
import type { Producto } from '../../types/domain';

interface LineaReserva extends LineaSeleccion {
  nombre: string;
  talla: string;
  color: string;
  imagen: string;
}

/** Horario minimo: la proxima hora en punto. */
function horarioPorDefecto(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function PaginaNuevaReserva() {
  const navegar = useNavigate();
  const toast = useToast();
  const { esCliente } = useAuth();
  const preseleccion = (useLocation().state ?? null) as {
    id_producto: number;
    id_talla: number | null;
    id_color: number | null;
    cantidad?: number;
  } | null;

  const sucursales = useSucursales();
  const crear = useCrearReserva();

  const [idSucursal, setIdSucursal] = useState<number | ''>('');
  const [horario, setHorario] = useState(horarioPorDefecto);
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaReserva[]>([]);
  const [error, setError] = useState('');

  // selector de prenda
  const [paginaBusqueda, setPaginaBusqueda] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [idProducto, setIdProducto] = useState<number | null>(preseleccion?.id_producto ?? null);
  const [idTalla, setIdTalla] = useState<number | null>(preseleccion?.id_talla ?? null);
  const [idColor, setIdColor] = useState<number | null>(preseleccion?.id_color ?? null);
  const [cantidad, setCantidad] = useState(preseleccion?.cantidad ?? 1);

  const resultados = useProductos({
    q: busqueda || undefined, page: paginaBusqueda, page_size: 6,
    id_sucursal: idSucursal || undefined,
  }, Boolean(idSucursal));
  const producto = useProducto(idProducto ?? undefined);
  const disponibilidad = useDisponibilidad(
    idProducto && idSucursal
      ? {
          id_producto: idProducto,
          id_sucursal: Number(idSucursal),
        }
      : null,
  );

  const stockConfirmado = disponibilidad.isSuccess && !disponibilidad.isFetching;
  const variantes = (disponibilidad.data ?? []).filter(
    (i) => i.id_producto === idProducto && i.id_sucursal === idSucursal,
  );
  const disponible = variantes
    .filter((i) => i.id_talla === idTalla && i.id_color === idColor)
    .reduce((acc, i) => acc + stockDisponible(i), 0);
  const tallaDisponible = (id: number) => stockConfirmado && variantes.some(
    (i) => i.id_talla === id && stockDisponible(i) > 0,
  );
  const colorDisponible = (id: number) => stockConfirmado && !!idTalla && variantes.some(
    (i) => i.id_talla === idTalla && i.id_color === id && stockDisponible(i) > 0,
  );

  function elegirProducto(p: Producto) {
    setIdProducto(p.id_producto);
    setIdTalla(null);
    setIdColor(null);
    setCantidad(1);
  }

  function agregarLinea() {
    const p = producto.data;
    if (
      !p?.activo ||
      !idTalla ||
      !idColor ||
      !p.tallas.some((t) => t.id_talla === idTalla) ||
      !p.colores.some((c) => c.id_color === idColor)
    ) {
      setError('Selecciona prenda, talla y color antes de agregarla a la reserva.');
      return;
    }
    if (!idSucursal) {
      setError('Selecciona primero la sucursal donde te probaras las prendas.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100)
      return setError('Elige entre 1 y 100 unidades por variante.');
    if (lineas.length >= 50) return setError('La reserva admite hasta 50 variantes.');
    if (!stockConfirmado)
      return setError('Espera a que se confirme la disponibilidad de esta variante.');
    if (disponible < cantidad) {
      setError('No hay unidades suficientes de esa combinacion en la sucursal elegida.');
      return;
    }
    const duplicada = lineas.some(
      (l) => l.id_producto === p.id_producto && l.id_talla === idTalla && l.id_color === idColor,
    );
    if (duplicada) {
      setError('Esa prenda ya esta en la reserva con la misma talla y color.');
      return;
    }

    setLineas((actuales) => [
      ...actuales,
      {
        id_producto: p.id_producto,
        id_talla: idTalla,
        id_color: idColor,
        cantidad,
        nombre: p.nombre,
        talla: p.tallas.find((t) => t.id_talla === idTalla)?.nombre ?? '',
        color: p.colores.find((c) => c.id_color === idColor)?.nombre ?? '',
        imagen: p.imagen_url,
      },
    ]);
    setError('');
    setIdTalla(null);
    setIdColor(null);
    setCantidad(1);
  }

  async function confirmar() {
    if (!idSucursal || !sucursales.data?.some((s) => s.id_sucursal === idSucursal))
      return setError('Selecciona una sucursal activa.');
    if (lineas.length === 0) return setError('Agrega al menos una prenda a la reserva.');
    if (!horario || !Number.isFinite(Date.parse(horario)) || Date.parse(horario) <= Date.now())
      return setError('Indica una fecha y hora futura para la visita.');
    if (!esCliente) return setError('Solo las cuentas de cliente pueden crear reservas.');

    try {
      const reserva = await crear.mutateAsync({
        id_sucursal: Number(idSucursal),
        horario_aproximado: new Date(horario).toISOString(),
        observacion,
        detalles: lineas.map(({ id_producto, id_talla, id_color, cantidad: c }) => ({
          id_producto,
          id_talla,
          id_color,
          cantidad: c,
        })),
      });
      toast.exito('Reserva creada. Puedes consultar su preparacion en Mis reservas.');
      navegar(`/mis-reservas?destacada=${reserva.id_reserva}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear la reserva.');
    }
  }

  return (
    <div className="fs-contenedor fs-compra">
      <section className="fs-pila" style={{ gap: 20 }}>
        <div>
          <p className="fs-eyebrow">Reserva en tienda</p>
          <h1>Aparta prendas para probartelas</h1>
          <p className="fs-sub">
            Elige la sucursal, arma tu seleccion y pasa a probarte las prendas en el horario que
            indiques.
          </p>
        </div>

        {error && <div className="fs-alerta fs-alerta--error">{error}</div>}

        <div className="fs-panel">
          <h3>1. Sucursal y horario</h3>
          {sucursales.isPending && <p>Cargando sucursales...</p>}
          {sucursales.isError && (
            <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />
          )}
          {lineas.length > 0 && (
            <p className="fs-sub">
              Todas las prendas pertenecen a la misma sucursal. Para cambiarla, quita primero las
              prendas de la seleccion.
            </p>
          )}
          <div className="fs-rejilla-form">
            <div className="fs-campo">
              <label htmlFor="sucursal-reserva">Sucursal</label>
              <select
                id="sucursal-reserva"
                disabled={lineas.length > 0 || crear.isPending}
                className="fs-select"
                value={idSucursal}
                onChange={(e) => {
                  setIdSucursal(e.target.value ? Number(e.target.value) : '');
                  setPaginaBusqueda(1);
                  // Conserva la prenda llegada desde el catalogo al elegir la primera sucursal.
                  if (idSucursal) {
                    setIdProducto(null);
                    setIdTalla(null);
                    setIdColor(null);
                    setCantidad(1);
                  }
                  setError('');
                }}
              >
                <option value="">Selecciona una sucursal</option>
                {sucursales.data?.map((s) => (
                  <option key={s.id_sucursal} value={s.id_sucursal}>
                    {s.nombre} - {s.ciudad}
                  </option>
                ))}
              </select>
            </div>
            <div className="fs-campo">
              <label htmlFor="horario">Horario aproximado</label>
              <input
                id="horario"
                type="datetime-local"
                className="fs-input"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
          </div>
          <div className="fs-campo">
            <label htmlFor="observacion">Observacion (opcional)</label>
            <textarea
              id="observacion"
              maxLength={500}
              className="fs-textarea"
              placeholder="Por ejemplo: quiero probar dos tallas del mismo vestido."
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>
        </div>

        <div className="fs-panel">
          <h3>2. Elige las prendas</h3>

          <div className="fs-campo">
            <label htmlFor="buscar-prenda">Buscar prenda</label>
            <input
              id="buscar-prenda"
              className="fs-input"
              placeholder="Escribe el nombre de la prenda"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPaginaBusqueda(1);
              }}
            />
          </div>

          {!idSucursal && <p>Selecciona una sucursal para ver las prendas disponibles.</p>}
          {idSucursal && resultados.isPending && <p>Buscando prendas disponibles...</p>}
          {idSucursal && resultados.isError && (
            <ErrorEstado error={resultados.error} onReintentar={() => resultados.refetch()} />
          )}
          {idSucursal && resultados.data?.total === 0 && <p>No hay prendas disponibles en esta sucursal que coincidan con la busqueda.</p>}
          <div className="fs-pos__resultados">
            {idSucursal && !resultados.isError && resultados.data?.items.map((p) => (
              <button
                key={p.id_producto}
                type="button"
                className="fs-pos__item"
                onClick={() => elegirProducto(p)}
                style={
                  idProducto === p.id_producto ? { borderColor: 'var(--fs-acento)' } : undefined
                }
              >
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.nombre}</span>
                <span className="fs-sub">{p.categoria?.nombre}</span>
              </button>
            ))}
          </div>

          {idSucursal && !resultados.isError && resultados.data && (
            <Paginacion
              page={resultados.data.page}
              pageSize={resultados.data.page_size}
              total={resultados.data.total}
              onCambiar={setPaginaBusqueda}
            />
          )}
          {idProducto && producto.isPending && <p>Cargando prenda...</p>}
          {producto.isError && (
            <ErrorEstado error={producto.error} onReintentar={() => producto.refetch()} />
          )}
          {disponibilidad.isError && (
            <ErrorEstado
              error={disponibilidad.error}
              onReintentar={() => disponibilidad.refetch()}
            />
          )}
          {idSucursal && idProducto && disponibilidad.isFetching && (
            <p>Consultando disponibilidad...</p>
          )}
          {idSucursal && producto.data && (
            <div className="fs-pila" style={{ gap: 12 }}>
              <hr className="fs-divisor" />
              <strong>{producto.data.nombre}</strong>
              {stockConfirmado && !variantes.some((i) => stockDisponible(i) > 0) && (
                <p>Esta prenda ya no tiene stock disponible en la sucursal. Elige otra prenda.</p>
              )}

              <div className="fs-pila" style={{ gap: 8 }}>
                <span className="fs-filtros__titulo">Talla</span>
                <div className="fs-opciones">
                  {producto.data.tallas.map((t) => (
                    <button
                      key={t.id_talla}
                      type="button"
                      className={`fs-chip${idTalla === t.id_talla ? ' fs-chip--activo' : ''}`}
                      disabled={!tallaDisponible(t.id_talla)}
                      title={tallaDisponible(t.id_talla) ? undefined : 'Sin disponibilidad en esta sucursal'}
                      onClick={() => { setIdTalla(t.id_talla); setIdColor(null); setCantidad(1); setError(''); }}
                    >
                      {t.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fs-pila" style={{ gap: 8 }}>
                <span className="fs-filtros__titulo">Color</span>
                <div className="fs-opciones">
                  {producto.data.colores.map((c) => (
                    <button
                      key={c.id_color}
                      type="button"
                      className={`fs-chip fs-chip--color${idColor === c.id_color ? ' fs-chip--activo' : ''}`}
                      disabled={!colorDisponible(c.id_color)}
                      title={colorDisponible(c.id_color) ? undefined : 'Sin disponibilidad para esta talla'}
                      onClick={() => { setIdColor(c.id_color); setCantidad(1); setError(''); }}
                    >
                      <span className="fs-punto-color" style={{ background: c.codigo_hex }} />
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fs-fila-wrap">
                <div className="fs-cantidad">
                  <button
                    type="button"
                    onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                    disabled={cantidad <= 1}
                  >
                    -
                  </button>
                  <span>{cantidad}</span>
                  <button
                    type="button"
                    onClick={() => setCantidad((c) => c + 1)}
                    disabled={cantidad >= Math.min(100, disponible) || !stockConfirmado}
                  >
                    +
                  </button>
                </div>

                {idSucursal && idTalla && idColor && disponibilidad.isSuccess && (
                  <BadgeStock disponible={disponible} />
                )}

                <button
                  type="button"
                  className="fs-btn fs-btn--contorno"
                  onClick={agregarLinea}
                  disabled={
                    crear.isPending ||
                    !stockConfirmado ||
                    !producto.data.activo ||
                    !idTalla || !idColor || disponible < cantidad ||
                    lineas.length >= 50
                  }
                >
                  Agregar a la reserva
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="fs-panel fs-resumen">
        <h3>Tu reserva</h3>
        {lineas.length === 0 && <p className="fs-sub">Todavia no agregaste prendas.</p>}

        <div className="fs-pila" style={{ gap: 12 }}>
          {lineas.map((l, i) => (
            <div
              key={`${l.id_producto}-${l.id_talla}-${l.id_color}`}
              className="fs-fila"
              style={{ gap: 10 }}
            >
              <div className="fs-linea-item__img" style={{ width: 52 }}>
                <ImagenProducto src={l.imagen} alt={l.nombre} />
              </div>
              <div className="fs-crecer">
                <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{l.nombre}</p>
                <p className="fs-sub">
                  {l.cantidad} u - Talla {l.talla} - {l.color}
                </p>
              </div>
              <button
                type="button"
                className="fs-btn fs-btn--fantasma fs-btn--s"
                onClick={() => setLineas((actuales) => actuales.filter((_, idx) => idx !== i))}
                disabled={crear.isPending}
                aria-label={`Quitar ${l.nombre}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <hr className="fs-divisor" />
        <p className="fs-sub">
          La reserva no es una compra: las prendas quedan apartadas para que puedas probartelas en
          tienda.
        </p>
        <button
          type="button"
          className="fs-btn fs-btn--acento fs-btn--bloque"
          onClick={confirmar}
          disabled={crear.isPending || lineas.length === 0 || sucursales.isError}
        >
          {crear.isPending ? 'Creando reserva...' : 'Confirmar reserva'}
        </button>
      </aside>
    </div>
  );
}
