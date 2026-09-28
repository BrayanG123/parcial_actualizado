import { useState } from 'react';
import { BadgeActivo } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Confirmacion } from '../../components/ui/Modal';
import { Paginacion } from '../../components/ui/Paginacion';
import { useToast } from '../../context/ToastContext';
import {
  useCategorias,
  useDesactivarProducto,
  useProductos,
} from '../../hooks/useCatalogo';
import { precioActual, promocionVigente } from '../../lib/domain';
import { moneda } from '../../lib/format';
import type { Producto } from '../../types/domain';
import { FormularioProducto } from './FormularioProducto';

export default function PaginaProductos() {
  const [q, setQ] = useState('');
  const [idCategoria, setIdCategoria] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [editando, setEditando] = useState<Producto | null | undefined>(undefined);
  const [porDesactivar, setPorDesactivar] = useState<Producto | null>(null);

  const categorias = useCategorias();
  const desactivar = useDesactivarProducto();
  const toast = useToast();

  const consulta = useProductos({
    q: q || undefined,
    id_categoria: idCategoria || undefined,
    incluir_inactivos: true,
    page,
    page_size: 10,
  });

  async function confirmarBaja() {
    if (!porDesactivar) return;
    try {
      await desactivar.mutateAsync(porDesactivar.id_producto);
      toast.exito('Producto dado de baja del catalogo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos dar de baja el producto.');
    } finally {
      setPorDesactivar(null);
    }
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Catalogo</p>
          <h1>Productos</h1>
          <p className="fs-sub">Alta, edicion, precios y promociones de las prendas.</p>
        </div>
        <button type="button" className="fs-btn fs-btn--acento" onClick={() => setEditando(null)}>
          Nuevo producto
        </button>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <div className="fs-fila-wrap">
          <div className="fs-campo fs-crecer" style={{ minWidth: 220 }}>
            <label htmlFor="buscar-producto">Buscar</label>
            <input
              id="buscar-producto"
              className="fs-input"
              placeholder="Nombre o descripcion"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="fs-campo" style={{ minWidth: 200 }}>
            <label htmlFor="filtro-categoria">Categoria</label>
            <select
              id="filtro-categoria"
              className="fs-select"
              value={idCategoria}
              onChange={(e) => {
                setIdCategoria(e.target.value ? Number(e.target.value) : '');
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {categorias.data?.map((c) => (
                <option key={c.id_categoria} value={c.id_categoria}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {consulta.isPending && <FilasSkeleton />}
        {consulta.isError && <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />}

        {consulta.data && consulta.data.items.length === 0 && (
          <Vacio titulo="Sin productos" mensaje="No hay prendas que coincidan con la busqueda." />
        )}

        {consulta.data && consulta.data.items.length > 0 && (
          <>
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoria</th>
                    <th>Coleccion</th>
                    <th className="fs-tabla-num">Precio</th>
                    <th className="fs-tabla-num">Promo</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.items.map((p) => (
                    <tr key={p.id_producto}>
                      <td>
                        <strong>{p.nombre}</strong>
                        <div className="fs-sub">
                          {p.tallas.map((t) => t.nombre).join(', ')} - {p.colores.length} colores
                        </div>
                      </td>
                      <td>{p.categoria?.nombre}</td>
                      <td>{p.coleccion?.nombre ?? <span className="fs-sub">-</span>}</td>
                      <td className="fs-tabla-num">
                        {promocionVigente(p) ? (
                          <>
                            <s className="fs-sub">{moneda(p.precio)}</s> {moneda(precioActual(p))}
                          </>
                        ) : (
                          moneda(p.precio)
                        )}
                      </td>
                      <td className="fs-tabla-num">
                        {p.descuento_pct > 0 ? `${p.descuento_pct}%` : <span className="fs-sub">-</span>}
                      </td>
                      <td>
                        <BadgeActivo activo={p.activo} />
                      </td>
                      <td className="fs-td-acciones">
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno fs-btn--s"
                          onClick={() => setEditando(p)}
                        >
                          Editar
                        </button>
                        {p.activo && (
                          <button
                            type="button"
                            className="fs-btn fs-btn--fantasma fs-btn--s"
                            onClick={() => setPorDesactivar(p)}
                          >
                            Dar de baja
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              page={consulta.data.page}
              pageSize={consulta.data.page_size}
              total={consulta.data.total}
              onCambiar={setPage}
            />
          </>
        )}
      </section>

      <FormularioProducto
        abierto={editando !== undefined}
        producto={editando ?? null}
        onCerrar={() => setEditando(undefined)}
      />

      <Confirmacion
        abierto={porDesactivar !== null}
        titulo="Dar de baja el producto"
        mensaje="El producto dejara de mostrarse en el catalogo publico pero se conservara su historial de ventas."
        textoConfirmar="Dar de baja"
        peligro
        cargando={desactivar.isPending}
        onConfirmar={confirmarBaja}
        onCancelar={() => setPorDesactivar(null)}
      />
    </>
  );
}
