import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { ErrorEstado, RejillaSkeleton, Vacio } from '../../components/ui/Estados';
import { Paginacion } from '../../components/ui/Paginacion';
import { useCategorias, useColores, useProductos, useTallas } from '../../hooks/useCatalogo';
import { useSucursales } from '../../hooks/useOperaciones';
import type { FiltrosProducto } from '../../services/catalogo.service';
import { TarjetaProducto } from './TarjetaProducto';

const POR_PAGINA = 12;

export default function PaginaCatalogo() {
  const { usuario } = useAuth();
  const [params, setParams] = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '');

  const categorias = useCategorias();
  const tallas = useTallas();
  const colores = useColores();
  const sucursales = useSucursales();

  const filtros = useMemo<FiltrosProducto>(() => {
    const num = (clave: string) => (params.get(clave) ? Number(params.get(clave)) : undefined);
    return {
      q: params.get('q') ?? undefined,
      id_categoria: num('id_categoria'),
      id_talla: num('id_talla'),
      id_color: num('id_color'),
      id_sucursal: num('id_sucursal'),
      solo_promocion: params.get('solo_promocion') === 'true' || undefined,
      orden: (params.get('orden') as FiltrosProducto['orden']) ?? undefined,
      page: num('page') ?? 1,
      page_size: POR_PAGINA,
    };
  }, [params]);

  const consulta = useProductos({ ...filtros, mayorista: usuario?.mayorista });

  function actualizar(clave: string, valor?: string | number | null) {
    const siguiente = new URLSearchParams(params);
    if (valor === undefined || valor === null || valor === '') siguiente.delete(clave);
    else siguiente.set(clave, String(valor));
    if (clave !== 'page') siguiente.delete('page');
    setParams(siguiente, { replace: true });
  }

  function alternar(clave: string, valor: number) {
    actualizar(clave, filtros[clave as keyof FiltrosProducto] === valor ? null : valor);
  }

  const hayFiltros = [
    'id_categoria',
    'id_talla',
    'id_color',
    'id_sucursal',
    'solo_promocion',
    'q',
  ].some((c) => params.get(c));

  return (
    <div className="fs-contenedor fs-catalogo">
      <aside className="fs-filtros">
        {[categorias, tallas, colores, sucursales].some((q) => q.isPending) && (
          <p>Cargando filtros...</p>
        )}
        {[categorias, tallas, colores, sucursales].map((q, i) =>
          q.isError ? (
            <ErrorEstado key={i} error={q.error} onReintentar={() => q.refetch()} />
          ) : null,
        )}
        <form
          className="fs-campo"
          onSubmit={(e) => {
            e.preventDefault();
            actualizar('q', busqueda.trim() || null);
          }}
        >
          <label htmlFor="buscar">Buscar</label>
          <input
            id="buscar"
            className="fs-input"
            placeholder="Vestido, blusa, jean..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </form>

        <div className="fs-filtros__grupo">
          <p className="fs-filtros__titulo">Categoria</p>
          <div className="fs-filtros__lista">
            {categorias.data?.map((c) => (
              <button
                key={c.id_categoria}
                type="button"
                className={`fs-filtro-btn${filtros.id_categoria === c.id_categoria ? ' activo' : ''}`}
                onClick={() => alternar('id_categoria', c.id_categoria)}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="fs-filtros__grupo">
          <p className="fs-filtros__titulo">Talla</p>
          <div className="fs-opciones">
            {tallas.data?.map((t) => (
              <button
                key={t.id_talla}
                type="button"
                className={`fs-chip${filtros.id_talla === t.id_talla ? ' fs-chip--activo' : ''}`}
                onClick={() => alternar('id_talla', t.id_talla)}
              >
                {t.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="fs-filtros__grupo">
          <p className="fs-filtros__titulo">Color</p>
          <div className="fs-opciones">
            {colores.data?.map((c) => (
              <button
                key={c.id_color}
                type="button"
                className={`fs-chip fs-chip--color${filtros.id_color === c.id_color ? ' fs-chip--activo' : ''}`}
                onClick={() => alternar('id_color', c.id_color)}
                title={c.nombre}
              >
                <span className="fs-punto-color" style={{ background: c.codigo_hex }} />
                {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="fs-filtros__grupo">
          <p className="fs-filtros__titulo">Disponibilidad</p>
          <div className="fs-campo">
            <select
              className="fs-select"
              value={params.get('id_sucursal') ?? ''}
              onChange={(e) => actualizar('id_sucursal', e.target.value || null)}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.data?.map((s) => (
                <option key={s.id_sucursal} value={s.id_sucursal}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <label className="fs-check">
            <input
              type="checkbox"
              checked={params.get('solo_promocion') === 'true'}
              onChange={(e) => actualizar('solo_promocion', e.target.checked ? 'true' : null)}
            />
            Solo promociones
          </label>
        </div>

        {hayFiltros && (
          <button
            type="button"
            className="fs-btn fs-btn--contorno fs-btn--s"
            onClick={() => setParams({})}
          >
            Limpiar filtros
          </button>
        )}
      </aside>

      <section className="fs-pila">
        <div className="fs-seccion__cabecera" style={{ marginBottom: 0 }}>
          <div>
            <p className="fs-eyebrow">Catalogo</p>
            <h1>Nueva coleccion</h1>
            {consulta.data && <p className="fs-sub">{consulta.data.total} prendas encontradas</p>}
          </div>
          <div className="fs-campo" style={{ minWidth: 190 }}>
            <label htmlFor="orden">Ordenar por</label>
            <select
              id="orden"
              className="fs-select"
              value={params.get('orden') ?? ''}
              onChange={(e) => actualizar('orden', e.target.value || null)}
            >
              <option value="">Relevancia</option>
              <option value="precio_asc">Precio: menor a mayor</option>
              <option value="precio_desc">Precio: mayor a menor</option>
              <option value="descuento">Mayor descuento</option>
              <option value="nombre">Nombre</option>
            </select>
          </div>
        </div>

        {consulta.isPending && <RejillaSkeleton />}
        {consulta.isError && (
          <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
        )}

        {consulta.data && consulta.data.items.length === 0 && (
          <Vacio
            titulo="No encontramos prendas"
            mensaje="Prueba con otra categoria, cambia la talla o limpia los filtros aplicados."
            accion={
              <button
                type="button"
                className="fs-btn fs-btn--contorno"
                onClick={() => setParams({})}
              >
                Limpiar filtros
              </button>
            }
          />
        )}

        {consulta.data && consulta.data.items.length > 0 && (
          <>
            <div className="fs-rejilla-productos">
              {consulta.data.items.map((p, i) => (
                <TarjetaProducto key={p.id_producto} producto={p} prioritaria={i < 4} />
              ))}
            </div>
            <Paginacion
              page={consulta.data.page}
              pageSize={consulta.data.page_size}
              total={consulta.data.total}
              onCambiar={(p) => actualizar('page', p)}
            />
          </>
        )}
      </section>
    </div>
  );
}
