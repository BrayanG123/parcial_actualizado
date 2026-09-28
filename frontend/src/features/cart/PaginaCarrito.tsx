import { useIsMutating } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Cargando, ErrorEstado, Vacio } from '../../components/ui/Estados';
import { ImagenProducto } from '../../components/ui/ImagenProducto';
import { useToast } from '../../context/ToastContext';
import {
  useCambiarCantidadCarrito,
  useCarrito,
  useQuitarDelCarrito,
  useVaciarCarrito,
} from '../../hooks/useComercio';
import { moneda } from '../../lib/format';
import { subtotal } from '../../lib/domain';

export default function PaginaCarrito() {
  const carrito = useCarrito();
  const ocupado = useIsMutating({ mutationKey: ['carrito', 'cambio'] }) > 0;
  const cambiarCantidad = useCambiarCantidadCarrito();
  const quitar = useQuitarDelCarrito();
  const vaciar = useVaciarCarrito();
  const toast = useToast();
  const navegar = useNavigate();

  if (carrito.isPending) return <Cargando texto="Cargando tu carrito..." />;
  if (carrito.isError)
    return <ErrorEstado error={carrito.error} onReintentar={() => carrito.refetch()} />;

  if (carrito.detalles.length === 0) {
    return (
      <div className="fs-contenedor" style={{ padding: '48px 0' }}>
        <Vacio
          titulo="Tu carrito esta vacio"
          mensaje="Explora el catalogo y agrega las prendas que quieras comprar."
          accion={
            <Link to="/catalogo" className="fs-btn fs-btn--acento">
              Ir al catalogo
            </Link>
          }
        />
      </div>
    );
  }

  async function accion(promesa: Promise<unknown>, mensajeExito: string) {
    try {
      await promesa;
      toast.exito(mensajeExito);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos actualizar el carrito.');
    }
  }

  return (
    <div className="fs-contenedor fs-compra">
      <section>
        <div className="fs-fila-entre" style={{ marginBottom: 16 }}>
          <div>
            <p className="fs-eyebrow">Compra</p>
            <h1>Tu carrito</h1>
          </div>
          <button
            type="button"
            className="fs-btn fs-btn--fantasma fs-btn--s"
            onClick={() => accion(vaciar.mutateAsync(), 'Carrito vaciado.')}
            disabled={ocupado}
          >
            Vaciar carrito
          </button>
        </div>

        {carrito.detalles.map((d) => (
          <article key={d.id_detalle_carrito} className="fs-linea-item">
            <Link to={`/producto/${d.id_producto}`} className="fs-linea-item__img">
              <ImagenProducto src={d.producto?.imagen_url ?? ''} alt={d.producto?.nombre ?? ''} />
            </Link>

            <div className="fs-pila" style={{ gap: 6 }}>
              <Link to={`/producto/${d.id_producto}`} style={{ fontWeight: 600 }}>
                {d.producto?.nombre}
              </Link>
              <span className="fs-sub">
                Talla {d.talla?.nombre} - {d.color?.nombre}
              </span>
              <span className="fs-sub">{moneda(d.precio_unitario)} c/u</span>
              {d.precio_cambio && (
                <p className="fs-alerta fs-alerta--info">
                  El precio cambio de {moneda(d.precio_guardado ?? 0)} a {moneda(d.precio_unitario)}
                  . El total usa el precio vigente.
                </p>
              )}
              {d.problema && (
                <p className="fs-alerta fs-alerta--error">
                  {
                    {
                      PRODUCT_INACTIVE: 'Esta prenda ya no esta activa. Quitala del carrito.',
                      VARIANT_UNAVAILABLE:
                        'Esta combinacion de talla y color ya no esta disponible.',
                      INSUFFICIENT_STOCK:
                        'Ninguna sucursal tiene suficientes unidades. Reduce la cantidad o quita la prenda.',
                    }[d.problema]
                  }
                </p>
              )}
              {d.disponibilidad && d.disponibilidad.length > 0 && (
                <p className="fs-sub">
                  Disponible por tienda:{' '}
                  {d.disponibilidad
                    .map((a) => `${a.sucursal.nombre}: ${a.cantidad_disponible}`)
                    .join(' ? ')}
                </p>
              )}

              <div className="fs-fila" style={{ gap: 12 }}>
                <div className="fs-cantidad">
                  <button
                    type="button"
                    onClick={() =>
                      accion(
                        cambiarCantidad.mutateAsync({
                          id: d.id_detalle_carrito,
                          cantidad: d.cantidad - 1,
                        }),
                        'Cantidad actualizada.',
                      )
                    }
                    disabled={d.cantidad <= 1 || ocupado}
                  >
                    -
                  </button>
                  <span>{d.cantidad}</span>
                  <button
                    type="button"
                    onClick={() =>
                      accion(
                        cambiarCantidad.mutateAsync({
                          id: d.id_detalle_carrito,
                          cantidad: d.cantidad + 1,
                        }),
                        'Cantidad actualizada.',
                      )
                    }
                    disabled={
                      ocupado ||
                      d.cantidad >=
                        Math.min(
                          100,
                          d.disponibilidad
                            ? Math.max(0, ...d.disponibilidad.map((a) => a.cantidad_disponible))
                            : 100,
                        )
                    }
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="fs-btn fs-btn--fantasma fs-btn--s"
                  onClick={() =>
                    accion(quitar.mutateAsync(d.id_detalle_carrito), 'Prenda eliminada.')
                  }
                  disabled={ocupado}
                >
                  Quitar
                </button>
              </div>
            </div>

            <strong className="fs-nums">
              {moneda(d.subtotal ?? subtotal(d.cantidad, d.precio_unitario))}
            </strong>
          </article>
        ))}
      </section>

      <aside className="fs-panel fs-resumen">
        <h3>Resumen</h3>
        <p className="fs-sub">
          Agregar prendas al carrito no reserva existencias. Los precios y el stock se comprueban
          nuevamente al comprar.
        </p>
        {carrito.data?.tiene_disponibilidad === false && (
          <p className="fs-alerta fs-alerta--error">
            No hay una sucursal que pueda atender todo el carrito. Revisa las prendas y cantidades.
          </p>
        )}
        {carrito.data?.sucursales_disponibles && carrito.data.sucursales_disponibles.length > 0 && (
          <p>
            Sucursales que pueden atender el carrito:{' '}
            {carrito.data.sucursales_disponibles.map((s) => s.nombre).join(', ')}.
          </p>
        )}
        <div className="fs-resumen__linea">
          <span>Prendas</span>
          <span className="fs-nums">{carrito.unidades}</span>
        </div>
        <div className="fs-resumen__linea">
          <span>Subtotal</span>
          <span className="fs-nums">{moneda(carrito.total)}</span>
        </div>
        <hr className="fs-divisor" />
        <div className="fs-resumen__total">
          <span>Total</span>
          <span className="fs-nums">{moneda(carrito.total)}</span>
        </div>
        <button
          type="button"
          className="fs-btn fs-btn--acento fs-btn--bloque"
          disabled={ocupado || carrito.data?.tiene_disponibilidad === false}
          onClick={() => navegar('/checkout')}
        >
          Continuar con la compra
        </button>
        <Link to="/catalogo" className="fs-btn fs-btn--contorno fs-btn--bloque">
          Seguir comprando
        </Link>
      </aside>
    </div>
  );
}
