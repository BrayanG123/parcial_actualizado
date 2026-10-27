import { useMemo, useState } from 'react';
import { moneda } from '../../lib/format';
import { antiguedad, DESACTUALIZADO_MS, stockLocal } from '../../offline/repositorio';
import type { ItemSeleccion } from '../../offline/cola';
import {
  claveVariante,
  ETIQUETA_OPERACION,
  EXPLICACION_CODIGO,
  type EstadoOperacion,
  type OperacionLocal,
  type SnapshotOffline,
  type VarianteSnapshot,
} from '../../offline/tipos';

/** Aviso de antiguedad de los datos descargados (enunciado 5.3). */
export function AvisoAntiguedad({ snapshot }: { snapshot: SnapshotOffline }) {
  const viejo = Date.now() - Date.parse(snapshot.generatedAt) > DESACTUALIZADO_MS;
  return (
    <div className={`fs-alerta ${viejo ? 'fs-alerta--error' : 'fs-alerta--info'}`} role="status">
      Datos de {snapshot.branch.name} descargados {antiguedad(snapshot.generatedAt)}
      {viejo
        ? '. Pueden estar desactualizados: precios y existencias se confirman al sincronizar.'
        : '. Precios y existencias se confirman al sincronizar.'}
      {snapshot.truncated && ' Se descargo solo una parte del catalogo.'}
    </div>
  );
}

interface Producto {
  productId: number;
  nombre: string;
  categoria: string;
  descripcion?: string | null;
  imagen?: string | null;
  variantes: VarianteSnapshot[];
}

function agrupar(variantes: VarianteSnapshot[]): Producto[] {
  const productos = new Map<number, Producto>();
  for (const v of variantes) {
    const p = productos.get(v.productId) ?? {
      productId: v.productId,
      nombre: v.productName,
      categoria: v.categoryName,
      descripcion: v.description,
      imagen: v.imageUrl,
      variantes: [],
    };
    p.variantes.push(v);
    productos.set(v.productId, p);
  }
  return [...productos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Catalogo descargado: productos, precios, tallas, colores y stock conocido (F5.2). */
export function CatalogoOffline({
  snapshot,
  operaciones,
  seleccion,
  onCambiar,
}: {
  snapshot: SnapshotOffline;
  operaciones: OperacionLocal[];
  seleccion: ItemSeleccion[];
  onCambiar: (seleccion: ItemSeleccion[]) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const productos = useMemo(() => agrupar(snapshot.variants), [snapshot]);
  const categorias = [...new Set(productos.map((p) => p.categoria))].sort();
  const visibles = productos.filter(
    (p) =>
      (!categoria || p.categoria === categoria) &&
      `${p.nombre} ${p.categoria}`.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );
  const cantidad = (v: VarianteSnapshot) =>
    seleccion.find((i) => claveVariante(i) === claveVariante(v))?.quantity ?? 0;
  function cambiar(v: VarianteSnapshot, delta: number) {
    const disponible = stockLocal(snapshot, operaciones, v);
    const nueva = Math.max(0, Math.min(100, disponible, cantidad(v) + delta));
    const resto = seleccion.filter((i) => claveVariante(i) !== claveVariante(v));
    onCambiar(
      nueva ? [...resto, { productId: v.productId, sizeId: v.sizeId, colorId: v.colorId, quantity: nueva }] : resto,
    );
  }
  return (
    <section className="fs-pila">
      <div className="fs-fila-wrap">
        <input
          className="fs-input"
          placeholder="Buscar prenda"
          aria-label="Buscar prenda offline"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="fs-input"
          aria-label="Filtrar por categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Todas las categorias</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {visibles.length === 0 && <p className="fs-sub">No hay prendas descargadas con ese filtro.</p>}
      {visibles.map((p) => (
        <article key={p.productId} className="fs-tarjeta fs-tarjeta--pad">
          <div className="fs-fila-entre">
            <div>
              <strong>{p.nombre}</strong>
              <p className="fs-sub">{p.categoria}</p>
            </div>
            <span>{moneda(Math.min(...p.variantes.map((v) => v.netUnitPrice)), snapshot.currency)}</span>
          </div>
          <div className="fs-fila-wrap" style={{ marginTop: 8 }}>
            {p.variantes.map((v) => {
              const disponible = stockLocal(snapshot, operaciones, v) - cantidad(v);
              return (
                <span key={claveVariante(v)} className="fs-fila fs-tarjeta" style={{ padding: '4px 8px', gap: 6 }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 12, height: 12, borderRadius: 6, background: v.hexCode, border: '1px solid #ccc' }}
                  />
                  <span>
                    {v.sizeName} / {v.colorName} · {moneda(v.netUnitPrice, snapshot.currency)}
                    {v.discount > 0 && <span className="fs-sub"> (antes {moneda(v.unitPrice, snapshot.currency)})</span>} ·{' '}
                    <span className={disponible > 0 ? '' : 'fs-sub'}>stock conocido {disponible}</span>
                  </span>
                  {cantidad(v) > 0 && (
                    <button
                      type="button"
                      className="fs-btn fs-btn--contorno fs-btn--s"
                      aria-label={`Quitar ${p.nombre} ${v.sizeName} ${v.colorName}`}
                      onClick={() => cambiar(v, -1)}
                    >
                      -
                    </button>
                  )}
                  {cantidad(v) > 0 && <strong>{cantidad(v)}</strong>}
                  <button
                    type="button"
                    className="fs-btn fs-btn--contorno fs-btn--s"
                    aria-label={`Agregar ${p.nombre} ${v.sizeName} ${v.colorName}`}
                    disabled={disponible <= 0}
                    onClick={() => cambiar(v, 1)}
                  >
                    +
                  </button>
                </span>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}

const CLASE_ESTADO: Record<EstadoOperacion, string> = {
  LOCAL: 'fs-badge--info',
  SENDING: 'fs-badge--info',
  RETRY: 'fs-badge--alerta',
  CONFIRMED: 'fs-badge--exito',
  CONFLICT: 'fs-badge--error',
  REJECTED: 'fs-badge--error',
  DESCARTADA: '',
};

export function BadgeOperacion({ estado }: { estado: EstadoOperacion }) {
  return <span className={`fs-badge ${CLASE_ESTADO[estado]}`}>{ETIQUETA_OPERACION[estado]}</span>;
}


type Variante = { productId: number; sizeId: number; colorId: number };

/** Detalle legible del conflicto (cantidades o precios por variante). */
export function DetalleConflicto({ op }: { op: OperacionLocal }) {
  const detalle = op.resultado?.detalle as
    | { variants?: Array<Variante & { requested?: number; available?: number; localUnitPrice?: number; currentUnitPrice?: number }> }
    | undefined;
  const nombre = (v: Variante) =>
    op.resumen.lineas[
      (op.payload.items as Variante[] | undefined)?.findIndex((i) => claveVariante(i) === claveVariante(v)) ?? -1
    ]?.nombre ?? `Producto ${v.productId}`;
  return (
    <div className="fs-pila" style={{ gap: 4 }}>
      {op.resultado?.codigo && (
        <p>
          <strong>{op.resultado.codigo}</strong>: {EXPLICACION_CODIGO[op.resultado.codigo] ?? op.resultado.mensaje}
        </p>
      )}
      {detalle?.variants?.map((v) => (
        <p key={claveVariante(v)} className="fs-sub">
          {nombre(v)}:{' '}
          {v.requested !== undefined && `solicitado ${v.requested}, disponible ${v.available}`}
          {v.currentUnitPrice !== undefined &&
            `precio local ${moneda(v.localUnitPrice ?? 0, op.resumen.moneda)}, vigente ${moneda(v.currentUnitPrice, op.resumen.moneda)}`}
        </p>
      ))}
    </div>
  );
}
