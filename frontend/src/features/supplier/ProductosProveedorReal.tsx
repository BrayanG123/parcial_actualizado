import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { BadgeActivo } from "../../components/ui/Badges";
import { Cargando, ErrorEstado, Vacio } from "../../components/ui/Estados";
import { Modal } from "../../components/ui/Modal";
import { Paginacion } from "../../components/ui/Paginacion";
import { useColecciones, useTemporadas } from "../../hooks/useCatalogo";
import { invalidarCatalogo } from "../../hooks/invalidarCatalogo";
import { revisionSesion } from "../../api/sesion";
import {
  proveedorService,
  type ProductoProveedor,
} from "../../services/proveedor.service";

export default function ProductosProveedorReal() {
  const { usuario } = useAuth();
  return usuario ? (
    <Productos key={`${usuario.id_usuario}:${usuario.id_proveedor}`} />
  ) : null;
}
function Productos() {
  const { usuario } = useAuth();
  const [page, setPage] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<ProductoProveedor | null>(null);
  const habilitado = Boolean(
    usuario?.id_proveedor && usuario.proveedor_activo !== false,
  );
  const consulta = useQuery({
    queryKey: ["proveedor-productos", usuario?.id_usuario, page, busqueda],
    queryFn: () => proveedorService.productos(page, busqueda),
    enabled: habilitado,
    retry: false,
  });
  if (!habilitado)
    return (
      <Vacio
        titulo="Cuenta sin proveedor activo asociado"
        mensaje="El administrador debe vincular tu cuenta desde Usuarios. Si acaba de hacerlo, vuelve a iniciar sesion."
      />
    );
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">{usuario?.proveedor_nombre}</p>
          <h1>Mis productos</h1>
          <p className="fs-sub">
            Actualiza la ficha y la disponibilidad de las prendas que
            suministras.
          </p>
        </div>
      </header>
      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <p>
          Administracion registra los productos y los asigna a tu proveedor. La
          disponibilidad que informes ayuda a planificar las compras; el stock
          de la tienda cambia cuando la sucursal recibe la mercaderia.
        </p>
        <label className="fs-campo">
          Buscar producto
          <input
            className="fs-input"
            maxLength={100}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPage(1);
            }}
          />
        </label>
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
                titulo="Sin productos"
                mensaje="No hay productos asignados que coincidan con la busqueda."
              />
            ) : (
              <div className="fs-tabla-scroll">
                <table className="fs-tabla">
                  <thead>
                    <tr>
                      <th>Prenda</th>
                      <th>Temporada / coleccion</th>
                      <th>Disponibilidad informada</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {consulta.data.data.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.name}
                          <div className="fs-sub">{p.category.name}</div>
                        </td>
                        <td>
                          {p.season.name} / {p.collection.name}
                        </td>
                        <td>{p.supplierAvailability || "Sin informar"}</td>
                        <td>
                          <BadgeActivo activo={p.active} />
                        </td>
                        <td>
                          <button
                            className="fs-btn fs-btn--contorno fs-btn--s"
                            onClick={() => setEditando(p)}
                          >
                            Editar ficha
                          </button>
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
      {editando && (
        <EditarFicha
          key={editando.id}
          producto={editando}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
function EditarFicha({
  producto,
  onCerrar,
}: {
  producto: ProductoProveedor;
  onCerrar: () => void;
}) {
  const temporadas = useTemporadas();
  const colecciones = useColecciones();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(producto.name);
  const [descripcion, setDescripcion] = useState(producto.description ?? "");
  const [disponibilidad, setDisponibilidad] = useState(
    producto.supplierAvailability ?? "",
  );
  const [seasonId, setSeasonId] = useState(producto.seasonId);
  const [collectionId, setCollectionId] = useState(producto.collectionId);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const lock = useRef(false);
  const cambio =
    seasonId !== producto.seasonId || collectionId !== producto.collectionId;
  async function guardar() {
    if (lock.current) return;
    if (nombre.trim().length < 2 || !seasonId || !collectionId) {
      setError("Completa el nombre, temporada y coleccion.");
      return;
    }
    lock.current = true;
    setOcupado(true);
    setError("");
    const revision = revisionSesion();
    try {
      await proveedorService.guardar(producto.id, {
        name: nombre.trim(),
        description: descripcion,
        supplierAvailability: disponibilidad,
        ...(cambio ? { seasonId, collectionId } : {}),
      });
      if (revision !== revisionSesion()) return;
      await invalidarCatalogo(qc);
      onCerrar();
    } catch (e) {
      if (revision === revisionSesion()) setError((e as Error).message);
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }
  return (
    <Modal
      abierto
      titulo="Editar ficha de producto"
      onCerrar={() => {
        if (!ocupado) onCerrar();
      }}
      pie={
        <>
          <button
            className="fs-btn fs-btn--contorno"
            disabled={ocupado}
            onClick={onCerrar}
          >
            Cancelar
          </button>
          <button
            className="fs-btn fs-btn--acento"
            disabled={
              ocupado ||
              (cambio &&
                (!collectionId || colecciones.isError || temporadas.isError))
            }
            onClick={() => void guardar()}
          >
            {ocupado ? "Guardando..." : "Guardar ficha"}
          </button>
        </>
      }
    >
      <div className="fs-pila">
        {error && (
          <p role="alert" className="fs-alerta fs-alerta--error">
            {error}
          </p>
        )}
        <label className="fs-campo">
          Nombre
          <input
            className="fs-input"
            value={nombre}
            maxLength={160}
            disabled={ocupado}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label className="fs-campo">
          Descripcion
          <textarea
            className="fs-input"
            value={descripcion}
            maxLength={5000}
            disabled={ocupado}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        <label className="fs-campo">
          Disponibilidad para suministrar
          <textarea
            className="fs-input"
            value={disponibilidad}
            maxLength={500}
            disabled={ocupado}
            placeholder="Ej.: 20 unidades talla M azul; entrega desde el viernes."
            onChange={(e) => setDisponibilidad(e.target.value)}
          />
        </label>
        {temporadas.isError && (
          <ErrorEstado
            error={temporadas.error}
            onReintentar={() => temporadas.refetch()}
          />
        )}
        {colecciones.isError && (
          <ErrorEstado
            error={colecciones.error}
            onReintentar={() => colecciones.refetch()}
          />
        )}
        <label className="fs-campo">
          Temporada
          <select
            className="fs-select"
            value={seasonId}
            disabled={ocupado || temporadas.isPending}
            onChange={(e) => {
              setSeasonId(Number(e.target.value));
              setCollectionId(0);
            }}
          >
            {!temporadas.data?.some(
              (t) => t.id_temporada === producto.seasonId,
            ) && (
              <option value={producto.seasonId}>
                {producto.season.name} (actual)
              </option>
            )}
            {temporadas.data
              ?.filter((t) => t.activa || t.id_temporada === producto.seasonId)
              .map((t) => (
                <option
                  key={t.id_temporada}
                  value={t.id_temporada}
                  disabled={!t.activa}
                >
                  {t.nombre}
                  {t.activa ? "" : " (inactiva)"}
                </option>
              ))}
          </select>
        </label>
        <label className="fs-campo">
          Coleccion
          <select
            className="fs-select"
            value={collectionId || ""}
            disabled={ocupado || colecciones.isPending}
            onChange={(e) => setCollectionId(Number(e.target.value))}
          >
            <option value="">Selecciona una coleccion</option>
            {seasonId === producto.seasonId &&
              !colecciones.data?.some(
                (c) => c.id_coleccion === producto.collectionId,
              ) && (
                <option value={producto.collectionId}>
                  {producto.collection.name} (actual)
                </option>
              )}
            {colecciones.data
              ?.filter(
                (c) =>
                  c.id_temporada === seasonId &&
                  (c.activa || c.id_coleccion === producto.collectionId),
              )
              .map((c) => (
                <option
                  key={c.id_coleccion}
                  value={c.id_coleccion}
                  disabled={!c.activa}
                >
                  {c.nombre}
                  {c.activa ? "" : " (inactiva)"}
                </option>
              ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
