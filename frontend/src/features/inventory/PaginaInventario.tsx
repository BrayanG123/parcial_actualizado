import { Link } from 'react-router-dom';
import { ModalEntrada } from './ModalEntrada';
import { useState } from 'react';
import { BadgeStock } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Paginacion } from '../../components/ui/Paginacion';
import { useAuth } from '../../context/AuthContext';
import { useInventario, useSucursales } from '../../hooks/useOperaciones';
import { stockDisponible } from '../../lib/domain';
import type { Inventario } from '../../types/domain';
import { ModalMovimiento } from './ModalMovimiento';

export default function PaginaInventario() {
  const { idSucursal, tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMINISTRADOR');

  const [entrada, setEntrada] = useState(false);
  const [q, setQ] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState<number | ''>(
    esAdmin ? '' : (idSucursal ?? ''),
  );
  const [soloCriticos, setSoloCriticos] = useState(false);
  const [page, setPage] = useState(1);
  const [seleccionado, setSeleccionado] = useState<Inventario | null>(null);

  const sucursales = useSucursales();
  const consulta = useInventario({
    q: q || undefined,
    id_sucursal: esAdmin ? sucursalFiltro || undefined : idSucursal || undefined,
    solo_criticos: soloCriticos || undefined,
    page,
    page_size: 15,
  });

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Operaciones</p>
          <h1>Inventario</h1>
          <p className="fs-sub">
            Un almacen por sucursal. Existencias por producto, talla y color. Disponible = fisico -
            reservado.
          </p>
        </div>
        <button type="button" className="fs-btn fs-btn--acento" onClick={() => setEntrada(true)}>
          Entrada de mercaderia
        </button>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <div className="fs-fila-wrap">
          <div className="fs-campo fs-crecer" style={{ minWidth: 220 }}>
            <label htmlFor="buscar-inventario">Buscar prenda</label>
            <input
              id="buscar-inventario"
              className="fs-input"
              placeholder="Nombre del producto"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {esAdmin && (
            <div className="fs-campo" style={{ minWidth: 220 }}>
              <label htmlFor="sucursal-inventario">Sucursal</label>
              <select
                id="sucursal-inventario"
                className="fs-select"
                value={sucursalFiltro}
                onChange={(e) => {
                  setSucursalFiltro(e.target.value ? Number(e.target.value) : '');
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {sucursales.data?.map((s) => (
                  <option key={s.id_sucursal} value={s.id_sucursal}>
                    {s.nombre} - {s.nombre_almacen ?? 'Almacen principal'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="fs-check" style={{ alignSelf: 'flex-end', paddingBottom: 10 }}>
            <input
              type="checkbox"
              checked={soloCriticos}
              onChange={(e) => {
                setSoloCriticos(e.target.checked);
                setPage(1);
              }}
            />
            Solo stock critico (3 o menos)
          </label>
        </div>

        {consulta.isPending && <FilasSkeleton filas={6} />}
        {consulta.isError && (
          <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
        )}
        {consulta.data && consulta.data.items.length === 0 && (
          <Vacio
            titulo="Sin registros"
            mensaje="No hay inventario que coincida con los filtros aplicados."
          />
        )}

        {consulta.data && consulta.data.items.length > 0 && (
          <>
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Prenda</th>
                    <th>Talla</th>
                    <th>Color</th>
                    <th>Sucursal</th>
                    <th className="fs-tabla-num">Fisico</th>
                    <th className="fs-tabla-num">Reservado</th>
                    <th>Disponible</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.items.map((i) => (
                    <tr key={i.id_inventario}>
                      <td>{i.producto?.nombre}</td>
                      <td>{i.talla?.nombre}</td>
                      <td>
                        <span className="fs-fila" style={{ gap: 6 }}>
                          <span
                            className="fs-punto-color"
                            style={{ background: i.color?.codigo_hex }}
                          />
                          {i.color?.nombre}
                        </span>
                      </td>
                      <td>
                        {i.sucursal?.nombre}
                        <div className="fs-sub">
                          {sucursales.data?.find((s) => s.id_sucursal === i.id_sucursal)
                            ?.nombre_almacen ?? 'Almacen principal'}
                        </div>
                      </td>
                      <td className="fs-tabla-num">{i.cantidad_fisica}</td>
                      <td className="fs-tabla-num">{i.cantidad_reservada}</td>
                      <td>
                        <BadgeStock disponible={stockDisponible(i)} />
                      </td>
                      <td className="fs-td-acciones">
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno fs-btn--s"
                          onClick={() => setSeleccionado(i)}
                        >
                          Registrar movimiento
                        </button>
                        <Link
                          className="fs-btn fs-btn--contorno fs-btn--s"
                          to={`${esAdmin ? '/admin' : '/sucursal'}/movimientos?id_inventario=${i.id_inventario}`}
                        >
                          Movimientos
                        </Link>
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

      {entrada && <ModalEntrada onCerrar={() => setEntrada(false)} />}
      <ModalMovimiento inventario={seleccionado} onCerrar={() => setSeleccionado(null)} />
    </>
  );
}
