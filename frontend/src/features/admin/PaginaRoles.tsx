import { Link } from 'react-router-dom';
import { useRoles } from '../../hooks/useOperaciones';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';

export default function PaginaRoles() {
  const roles = useRoles();
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Administracion</p>
          <h1>Roles</h1>
          <p className="fs-sub">
            Perfiles de acceso definidos por el sistema. Asignalos desde la administracion de
            usuarios.
          </p>
        </div>
        <Link className="fs-btn fs-btn--acento" to="/admin/usuarios">
          Administrar usuarios
        </Link>
      </header>
      <section className="fs-tarjeta fs-tarjeta--pad">
        {roles.isPending && <FilasSkeleton />}
        {roles.isError && <ErrorEstado error={roles.error} onReintentar={() => roles.refetch()} />}
        {roles.data && (
          <table className="fs-tabla">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {roles.data.map((r) => (
                <tr key={r.id_rol}>
                  <td>{r.nombre}</td>
                  <td>{r.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
