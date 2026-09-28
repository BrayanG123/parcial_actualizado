import { useIsMutating } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeStock } from '../../components/ui/Badges';
import { Cargando, ErrorEstado } from '../../components/ui/Estados';
import { GaleriaProducto } from './GaleriaProducto';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProducto } from '../../hooks/useCatalogo';
import { useAgregarAlCarrito, useCarrito } from '../../hooks/useComercio';
import { useDisponibilidad, useRecomendaciones } from '../../hooks/useOperaciones';
import { precioActual, promocionVigente, stockDisponible } from '../../lib/domain';
import { fecha, moneda } from '../../lib/format';
import { TarjetaProducto } from './TarjetaProducto';

export default function PaginaProducto() {
  const { id } = useParams();
  const idProducto = Number(id);
  const navegar = useNavigate();
  const toast = useToast();
  const { autenticado, esCliente, usuario } = useAuth();

  const consulta = useProducto(idProducto);
  const recomendaciones = useRecomendaciones({ limite: 4, id_producto: idProducto }, idProducto > 0);
  const agregar = useAgregarAlCarrito();
  const carrito = useCarrito();
  const cambiandoCarrito = useIsMutating({ mutationKey: ['carrito', 'cambio'] }) > 0;

  const [idTalla, setIdTalla] = useState<number | null>(null);
  const [idColor, setIdColor] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(1);

  const disponibilidad = useDisponibilidad(
    idTalla && idColor ? { id_producto: idProducto, id_talla: idTalla, id_color: idColor } : null,
  );

  const totalDisponible = useMemo(
    () => (disponibilidad.data ?? []).reduce((acc, i) => acc + stockDisponible(i), 0),
    [disponibilidad.data],
  );

  if (consulta.isPending) return <Cargando texto="Cargando prenda..." />;
  if (consulta.isError)
    return <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />;

  const producto = consulta.data!;
  if (!producto.activo)
    return (
      <div className="fs-contenedor fs-seccion">
        <h1>Prenda no disponible</h1>
        <p>Esta prenda ya no esta activa en el catalogo.</p>
        <Link to="/catalogo">Volver al catalogo</Link>
      </div>
    );
  const mayorista = Boolean(usuario?.mayorista && producto.precio_mayorista != null);
  const enPromo = !mayorista && promocionVigente(producto);
  const precio = mayorista ? producto.precio_mayorista! : precioActual(producto);
  const seleccionCompleta = Boolean(
    idTalla &&
    idColor &&
    producto.tallas.some((t) => t.id_talla === idTalla) &&
    producto.colores.some((c) => c.id_color === idColor),
  );
  const maximoPorSucursal = Math.max(0, ...(disponibilidad.data ?? []).map(stockDisponible));
  const enCarrito =
    carrito.detalles.find(
      (d) => d.id_producto === idProducto && d.id_talla === idTalla && d.id_color === idColor,
    )?.cantidad ?? 0;
  const maximoAgregar = Math.max(0, Math.min(100, maximoPorSucursal) - enCarrito);

  async function agregarAlCarrito() {
    if (!autenticado) {
      navegar('/login', { state: { desde: `/producto/${idProducto}` } });
      return;
    }
    if (!esCliente) {
      toast.error('Solo las cuentas de cliente pueden comprar en linea.');
      return;
    }
    if (
      !seleccionCompleta ||
      cantidad > maximoAgregar ||
      !Number.isInteger(cantidad) ||
      cantidad < 1
    )
      return;
    try {
      await agregar.mutateAsync({
        id_producto: idProducto,
        id_talla: idTalla!,
        id_color: idColor!,
        cantidad,
      });
      toast.exito('Prenda agregada al carrito.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos agregar la prenda.');
    }
  }

  function reservar() {
    navegar('/reservas/nueva', {
      state: { id_producto: idProducto, id_talla: idTalla, id_color: idColor, cantidad },
    });
  }

  return (
    <div className="fs-contenedor">
      <nav className="fs-sub" style={{ paddingTop: 20 }}>
        <Link to="/catalogo">Catalogo</Link>
        {' / '}
        <Link to={`/catalogo?id_categoria=${producto.id_categoria}`}>
          {producto.categoria?.nombre}
        </Link>
      </nav>

      <div className="fs-detalle">
        <GaleriaProducto
          key={producto.id_producto}
          fotos={producto.imagenes ?? (producto.imagen_url ? [producto.imagen_url] : [])}
          nombre={producto.nombre}
        />

        <div className="fs-pila" style={{ gap: 20 }}>
          <div className="fs-pila" style={{ gap: 8 }}>
            <p className="fs-eyebrow">{producto.coleccion?.nombre ?? producto.categoria?.nombre}</p>
            <h1>{producto.nombre}</h1>
            <div className="fs-fila" style={{ gap: 12 }}>
              <strong style={{ fontSize: '1.5rem' }}>{moneda(precio)}</strong>
              {mayorista && <span className="fs-badge">Precio mayorista</span>}
              {enPromo && (
                <>
                  <s className="fs-sub">{moneda(producto.precio)}</s>
                  <span className="fs-badge fs-badge--acento">-{producto.descuento_pct}%</span>
                </>
              )}
            </div>
            {enPromo && producto.promo_fin && (
              <p className="fs-sub">Promocion vigente hasta {fecha(producto.promo_fin)}</p>
            )}
          </div>

          <p style={{ color: 'var(--fs-tinta-2)' }}>{producto.descripcion}</p>

          <div className="fs-pila" style={{ gap: 10 }}>
            <p className="fs-filtros__titulo">Talla</p>
            <div className="fs-opciones">
              {producto.tallas.map((t) => (
                <button
                  key={t.id_talla}
                  type="button"
                  className={`fs-chip${idTalla === t.id_talla ? ' fs-chip--activo' : ''}`}
                  onClick={() => {
                    setIdTalla(t.id_talla);
                    setCantidad(1);
                  }}
                >
                  {t.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="fs-pila" style={{ gap: 10 }}>
            <p className="fs-filtros__titulo">Color</p>
            <div className="fs-opciones">
              {producto.colores.map((c) => (
                <button
                  key={c.id_color}
                  type="button"
                  className={`fs-chip fs-chip--color${idColor === c.id_color ? ' fs-chip--activo' : ''}`}
                  onClick={() => {
                    setIdColor(c.id_color);
                    setCantidad(1);
                  }}
                >
                  <span className="fs-punto-color" style={{ background: c.codigo_hex }} />
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="fs-panel" style={{ gap: 12 }}>
            <div className="fs-fila-entre">
              <p className="fs-filtros__titulo" style={{ margin: 0 }}>
                Disponibilidad por sucursal
              </p>
              {seleccionCompleta && disponibilidad.isSuccess && (
                <BadgeStock disponible={totalDisponible} />
              )}
            </div>

            {!seleccionCompleta && (
              <p className="fs-sub">Selecciona talla y color para ver el stock de cada tienda.</p>
            )}
            {seleccionCompleta && disponibilidad.isPending && (
              <p className="fs-sub">Consultando stock...</p>
            )}
            {seleccionCompleta && disponibilidad.isError && (
              <ErrorEstado
                error={disponibilidad.error}
                onReintentar={() => disponibilidad.refetch()}
              />
            )}
            {seleccionCompleta && disponibilidad.data?.length === 0 && (
              <p className="fs-sub">No hay existencias disponibles para esta combinacion.</p>
            )}
            {seleccionCompleta && disponibilidad.data && (
              <ul className="fs-pila" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                {disponibilidad.data.map((inv) => (
                  <li key={inv.id_inventario} className="fs-fila-entre">
                    <span>
                      {inv.sucursal?.nombre}
                      <span className="fs-sub"> - {inv.sucursal?.ciudad}</span>
                    </span>
                    <BadgeStock disponible={stockDisponible(inv)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {seleccionCompleta && disponibilidad.isSuccess && (
            <p className="fs-sub">
              Una misma tienda debe disponer de la cantidad elegida.{' '}
              {enCarrito > 0 && `Ya tienes ${enCarrito} unidades de esta variante en el carrito.`}
            </p>
          )}
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
                disabled={seleccionCompleta && cantidad >= maximoAgregar}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="fs-btn fs-btn--acento fs-crecer"
              onClick={agregarAlCarrito}
              disabled={
                !seleccionCompleta ||
                !disponibilidad.isSuccess ||
                maximoAgregar < cantidad ||
                cambiandoCarrito
              }
            >
              {agregar.isPending ? 'Agregando...' : 'Agregar al carrito'}
            </button>

            <button
              type="button"
              className="fs-btn fs-btn--contorno"
              onClick={reservar}
              disabled={
                !seleccionCompleta || !disponibilidad.isSuccess || maximoPorSucursal < cantidad
              }
            >
              Reservar para probar
            </button>
          </div>

          {producto.tiene_recurso_ra && (
            <div className="fs-alerta fs-alerta--info">
              <span>
                Esta prenda tiene probador virtual. Abre FashionStore en la app movil para verla con
                realidad aumentada.
              </span>
            </div>
          )}
        </div>
      </div>

      {recomendaciones.data && recomendaciones.data.length > 0 && (
        <section className="fs-seccion">
          <div className="fs-seccion__cabecera">
            <div>
              <p className="fs-eyebrow">Sugerencias</p>
              <h2>Podria combinarte</h2>
            </div>
          </div>
          <div className="fs-rejilla-productos">
            {recomendaciones.data
              .filter((r) => r.producto && r.id_producto !== idProducto)
              .map((r) => (
                <div key={r.id_recomendacion} className="fs-pila" style={{ gap: 6 }}>
                  <TarjetaProducto producto={r.producto!} />
                  <p className="fs-sub" style={{ fontSize: '0.8rem' }}>
                    {r.motivo}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
