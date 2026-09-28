import { USAR_MOCKS } from '../../api/config';
import EntregasProveedorReal from './EntregasProveedorReal';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { useMovimientos, useProductosDeProveedor } from '../../hooks/useOperaciones';
import { fecha, fechaHora } from '../../lib/format';
import { TipoMovimiento } from '../../types/domain';

/**
 * Entradas programadas de mercaderia que involucran prendas del proveedor.
 * La informacion proviene de MovimientoInventario con tipo INGRESO_PENDIENTE.
 */
export default function PaginaEntregas() {
  return USAR_MOCKS ? (
    <EntregasDemo />
  ) : (
    <EntregasProveedorReal />
  );
}

function EntregasDemo() {
  const { usuario } = useAuth();
  const idProveedor = usuario?.id_proveedor ?? undefined;

  const productos = useProductosDeProveedor(idProveedor);
  const movimientos = useMovimientos({ id_inventario: 0, tipo: TipoMovimiento.INGRESO_PENDIENTE });

  const idsPropios = new Set(productos.data?.map((p) => p.id_producto) ?? []);
  const entregas = (movimientos.data?.items ?? []).filter((m) =>
    idsPropios.has(m.inventario?.id_producto ?? -1),
  );

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Proveedor</p>
          <h1>Entregas programadas</h1>
          <p className="fs-sub">Ingresos de mercaderia pendientes de recepcion en sucursal.</p>
        </div>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad">
        {(movimientos.isPending || productos.isPending) && <FilasSkeleton filas={4} />}
        {movimientos.isError && (
          <ErrorEstado error={movimientos.error} onReintentar={() => movimientos.refetch()} />
        )}

        {movimientos.data && entregas.length === 0 && (
          <Vacio
            titulo="Sin entregas programadas"
            mensaje="Cuando una sucursal registre un ingreso pendiente de tus prendas, aparecera en esta lista."
          />
        )}

        {entregas.length > 0 && (
          <div className="fs-tabla-scroll">
            <table className="fs-tabla">
              <thead>
                <tr>
                  <th>Prenda</th>
                  <th>Sucursal</th>
                  <th className="fs-tabla-num">Cantidad</th>
                  <th>Referencia</th>
                  <th>Registrado</th>
                  <th>Fecha programada</th>
                </tr>
              </thead>
              <tbody>
                {entregas.map((m) => (
                  <tr key={m.id_movimiento}>
                    <td>
                      {m.inventario?.producto?.nombre}
                      <div className="fs-sub">
                        {m.inventario?.talla?.nombre} - {m.inventario?.color?.nombre}
                      </div>
                    </td>
                    <td>{m.inventario?.sucursal?.nombre}</td>
                    <td className="fs-tabla-num">{m.cantidad}</td>
                    <td className="fs-sub">{m.referencia || '-'}</td>
                    <td>{fechaHora(m.fecha)}</td>
                    <td>{fecha(m.fecha_programada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
