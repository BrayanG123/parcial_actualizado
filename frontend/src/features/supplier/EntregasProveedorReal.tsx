import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { Cargando, ErrorEstado, Vacio } from "../../components/ui/Estados";
import { Paginacion } from "../../components/ui/Paginacion";
import { proveedorService } from "../../services/proveedor.service";
import { fecha, fechaHora } from "../../lib/format";

export default function EntregasProveedorReal() {
  const { usuario } = useAuth();
  const [page, setPage] = useState(1);
  const enabled = Boolean(
    usuario?.id_proveedor && usuario.proveedor_activo !== false,
  );
  const consulta = useQuery({
    queryKey: ["proveedor-entregas", usuario?.id_usuario, page],
    queryFn: () => proveedorService.entregas(page),
    enabled,
    refetchInterval: 30000,
    retry: false,
  });
  if (!enabled)
    return (
      <Vacio
        titulo="Cuenta sin proveedor activo asociado"
        mensaje="Solicita al administrador que vincule tu cuenta y vuelve a iniciar sesion."
      />
    );
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">{usuario?.proveedor_nombre}</p>
          <h1>Entregas programadas</h1>
          <p className="fs-sub">
            Entradas de tus prendas registradas por la tienda. La sucursal
            confirma su recepcion.
          </p>
        </div>
      </header>
      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        {consulta.isPending && <Cargando />}
        {consulta.isError && (
          <ErrorEstado
            error={consulta.error}
            onReintentar={() => consulta.refetch()}
          />
        )}
        {consulta.data && (
          <>
            {!consulta.data.data.length ? (
              <Vacio
                titulo="Sin entregas programadas"
                mensaje="Cuando la tienda programe un ingreso de tus prendas aparecera aqui."
              />
            ) : (
              <div className="fs-tabla-scroll">
                <table className="fs-tabla">
                  <thead>
                    <tr>
                      <th>Prenda / variante</th>
                      <th>Sucursal</th>
                      <th>Cantidad</th>
                      <th>Referencia</th>
                      <th>Registro</th>
                      <th>Programada</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consulta.data.data.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.inventory.product.name}
                          <div className="fs-sub">
                            {e.inventory.size.name} / {e.inventory.color.name}
                          </div>
                        </td>
                        <td>
                          {e.inventory.branch.name} · {e.inventory.branch.city}
                        </td>
                        <td>{e.quantity}</td>
                        <td>{e.reference || "-"}</td>
                        <td>{fechaHora(e.occurredAt)}</td>
                        <td>{fecha(e.scheduledAt)}</td>
                        <td>
                          {
                            {
                              PENDING: "Pendiente",
                              COMPLETED: "Recibida",
                              CANCELLED: "Cancelada",
                            }[e.status]
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Paginacion
              page={page}
              pageSize={20}
              total={consulta.data.meta.total}
              onCambiar={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}
