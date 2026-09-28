import { memo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import { ImagenProducto } from '../../components/ui/ImagenProducto';
import { precioActual, promocionVigente } from '../../lib/domain';
import { moneda } from '../../lib/format';
import type { Producto } from '../../types/domain';

interface Props {
  producto: Producto;
  prioritaria?: boolean;
}

function TarjetaProductoBase({ producto, prioritaria }: Props) {
  const { usuario } = useAuth();
  const mayorista = Boolean(usuario?.mayorista && producto.precio_mayorista != null);
  const enPromo = !mayorista && promocionVigente(producto);
  const precio = mayorista ? producto.precio_mayorista! : precioActual(producto);

  return (
    <article className="fs-producto">
      <Link to={`/producto/${producto.id_producto}`} className="fs-producto__figura">
        <ImagenProducto src={producto.imagen_url} alt={producto.nombre} prioritaria={prioritaria} />
        <div className="fs-producto__cintas">
          {enPromo && <span className="fs-cinta">-{producto.descuento_pct}%</span>}
          {producto.tiene_recurso_ra && <span className="fs-cinta fs-cinta--ra">Probador RA</span>}
        </div>
      </Link>

      <div className="fs-pila" style={{ gap: 6 }}>
        <span className="fs-producto__cat">{producto.categoria?.nombre ?? 'Coleccion'}</span>
        <Link to={`/producto/${producto.id_producto}`} className="fs-producto__nombre">
          {producto.nombre}
        </Link>
        <div className="fs-producto__precio">
          <strong>{moneda(precio)}</strong>
          {mayorista && <span className="fs-badge">Precio mayorista</span>}
          {enPromo && <s>{moneda(producto.precio)}</s>}
        </div>
        <div className="fs-producto__colores" aria-label="Colores disponibles">
          {producto.colores.slice(0, 5).map((c) => (
            <span
              key={c.id_color}
              className="fs-punto-color"
              style={{ background: c.codigo_hex }}
              title={c.nombre}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

export const TarjetaProducto = memo(TarjetaProductoBase);
