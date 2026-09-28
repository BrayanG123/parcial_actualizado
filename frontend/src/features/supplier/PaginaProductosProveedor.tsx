import { useEffect, useState } from 'react';
import { USAR_MOCKS } from '../../api/config';
import ProductosProveedorReal from './ProductosProveedorReal';
import { BadgeActivo } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useColecciones, useGuardarProducto, useTemporadas } from '../../hooks/useCatalogo';
import { useProductosDeProveedor } from '../../hooks/useOperaciones';
import { moneda } from '../../lib/format';
import type { Producto } from '../../types/domain';

/**
 * El proveedor no administra precios ni stock: solo la informacion comercial
 * de sus prendas (temporada y coleccion a la que pertenecen).
 */
export default function PaginaProductosProveedor() {
  return USAR_MOCKS ? <ProductosDemo /> : <ProductosProveedorReal />;
}
function ProductosDemo() {
  const { usuario } = useAuth();
  const idProveedor = usuario?.id_proveedor ?? undefined;

  const consulta = useProductosDeProveedor(idProveedor);
  const temporadas = useTemporadas();
  const colecciones = useColecciones();
  const guardar = useGuardarProducto();
  const toast = useToast();

  const [editando, setEditando] = useState<Producto | null>(null);
  const [idTemporada, setIdTemporada] = useState<number | ''>('');
  const [idColeccion, setIdColeccion] = useState<number | ''>('');

  useEffect(() => {
    setIdTemporada(editando?.id_temporada ?? '');
    setIdColeccion(editando?.id_coleccion ?? '');
  }, [editando]);

  if (!idProveedor) {
    return (
      <div className="fs-tarjeta fs-tarjeta--pad">
        <Vacio
          titulo="Cuenta sin proveedor asociado"
          mensaje="Tu usuario no esta vinculado a un proveedor. Solicita al administrador que complete la asociacion."
        />
      </div>
    );
  }

  async function aplicar() {
    if (!editando) return;
    try {
      await guardar.mutateAsync({
        id: editando.id_producto,
        datos: {
          id_temporada: idTemporada === '' ? null : Number(idTemporada),
          id_coleccion: idColeccion === '' ? null : Number(idColeccion),
        } as never,
      });
      toast.exito('Informacion actualizada.');
      setEditando(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos guardar los cambios.');
    }
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Proveedor</p>
          <h1>Mis productos</h1>
          <p className="fs-sub">Prendas que suministras al catalogo de FashionStore.</p>
        </div>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad">
        {consulta.isPending && <FilasSkeleton filas={5} />}
        {consulta.isError && <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />}
        {consulta.data && consulta.data.length === 0 && (
          <Vacio titulo="Sin productos" mensaje="Todavia no hay prendas registradas a tu nombre en el catalogo." />
        )}

        {consulta.data && consulta.data.length > 0 && (
          <div className="fs-tabla-scroll">
            <table className="fs-tabla">
              <thead>
                <tr>
                  <th>Prenda</th>
                  <th>Categoria</th>
                  <th>Temporada</th>
                  <th>Coleccion</th>
                  <th className="fs-tabla-num">Precio</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {consulta.data.map((p) => (
                  <tr key={p.id_producto}>
                    <td>{p.nombre}</td>
                    <td>{p.categoria?.nombre}</td>
                    <td>{p.temporada?.nombre ?? <span className="fs-sub">Sin asignar</span>}</td>
                    <td>{p.coleccion?.nombre ?? <span className="fs-sub">Sin asignar</span>}</td>
                    <td className="fs-tabla-num">{moneda(p.precio)}</td>
                    <td>
                      <BadgeActivo activo={p.activo} />
                    </td>
                    <td className="fs-td-acciones">
                      <button type="button" className="fs-btn fs-btn--contorno fs-btn--s" onClick={() => setEditando(p)}>
                        Asignar temporada
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        abierto={editando !== null}
        titulo="Temporada y coleccion"
        onCerrar={() => setEditando(null)}
        pie={
          <>
            <button type="button" className="fs-btn fs-btn--contorno" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="button" className="fs-btn fs-btn--acento" onClick={aplicar} disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="fs-pila">
          <p className="fs-sub">{editando?.nombre}</p>
          <div className="fs-campo">
            <label htmlFor="temporada-proveedor">Temporada</label>
            <select
              id="temporada-proveedor"
              className="fs-select"
              value={idTemporada}
              onChange={(e) => setIdTemporada(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Sin temporada</option>
              {temporadas.data?.map((t) => (
                <option key={t.id_temporada} value={t.id_temporada}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="fs-campo">
            <label htmlFor="coleccion-proveedor">Coleccion</label>
            <select
              id="coleccion-proveedor"
              className="fs-select"
              value={idColeccion}
              onChange={(e) => setIdColeccion(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Sin coleccion</option>
              {colecciones.data?.map((c) => (
                <option key={c.id_coleccion} value={c.id_coleccion}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </>
  );
}
