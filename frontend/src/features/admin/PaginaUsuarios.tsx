import { useAuth } from '../../context/AuthContext';
import { RolesUsuario } from './RolesUsuario';
import { useEffect, useState } from 'react';
import { BadgeActivo } from '../../components/ui/Badges';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Confirmacion, Modal } from '../../components/ui/Modal';
import { Paginacion } from '../../components/ui/Paginacion';
import { useToast } from '../../context/ToastContext';
import {
  useDesactivarUsuario,
  useGuardarUsuario,
  useRoles,
  useSucursales,
  useUsuarios,
  useProveedores,
} from '../../hooks/useOperaciones';
import {
  email as validarEmail,
  hayErrores,
  requerido,
  passwordRegistro,
  type Errores,
} from '../../lib/validacion';
import type { DatosUsuario } from '../../services/organizacion.service';
import { fecha } from '../../lib/format';
import { RolNombre, type Usuario } from '../../types/domain';

const VACIO: DatosUsuario = {
  nombre: '',
  mayorista: false,
  email: '',
  password: '',
  activo: true,
  id_roles: [],
  telefono: '',
  direccion: '',
  cargo: '',
  id_sucursal: null,
  id_proveedor: null,
};

export default function PaginaUsuarios() {
  const auth = useAuth();
  const [usuarioRoles, setUsuarioRoles] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [idRol, setIdRol] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [editando, setEditando] = useState<Usuario | null | undefined>(undefined);
  const [datos, setDatos] = useState<DatosUsuario>(VACIO);
  const [errores, setErrores] = useState<Errores<DatosUsuario>>({});
  const [porDesactivar, setPorDesactivar] = useState<Usuario | null>(null);

  const roles = useRoles();
  const proveedores = useProveedores();
  const sucursales = useSucursales();
  const guardar = useGuardarUsuario();
  const desactivar = useDesactivarUsuario();
  const toast = useToast();

  const consulta = useUsuarios({
    q: q || undefined,
    id_rol: idRol || undefined,
    page,
    page_size: 10,
  });

  useEffect(() => {
    if (editando === undefined) return;
    setErrores({});
    if (!editando) {
      setDatos(VACIO);
      return;
    }
    const u = editando as Usuario & Record<string, unknown>;
    setDatos({
      nombre: u.nombre,
      mayorista: u.mayorista ?? false,
      email: u.email,
      password: '',
      activo: u.activo,
      id_roles: u.roles.map((r) => r.id_rol),
      telefono: (u.telefono as string) ?? '',
      direccion: (u.direccion as string) ?? '',
      cargo: (u.cargo as string) ?? '',
      id_sucursal: (u.id_sucursal as number | null) ?? null,
      id_proveedor: u.id_proveedor ?? null,
    });
  }, [editando]);

  const seleccionados = roles.data?.filter((r) => datos.id_roles.includes(r.id_rol)) ?? [];
  const esProveedor = seleccionados.some(r => r.nombre === RolNombre.PROVEEDOR) || Boolean(editando?.id_proveedor);
  const esCliente = editando
    ? Boolean(editando.id_cliente)
    : seleccionados.some((r) => r.nombre === RolNombre.CLIENTE);
  const esEmpleado = editando
    ? Boolean(editando.id_empleado)
    : seleccionados.some(
        (r) => r.nombre === RolNombre.CAJERO || r.nombre === RolNombre.ENCARGADO_SUCURSAL,
      );
  const dependenciasPendientes =
    roles.isPending ||
    roles.isError ||
    (esEmpleado && (sucursales.isPending || sucursales.isError));

  function alternarRol(id: number) {
    setDatos((d) => ({
      ...d,
      id_roles: d.id_roles.includes(id) ? d.id_roles.filter((x) => x !== id) : [...d.id_roles, id],
    }));
  }

  async function enviar() {
    const nuevos: Errores<DatosUsuario> = {
      nombre:
        datos.nombre.trim().length < 2 || datos.nombre.trim().length > 120
          ? 'Usa entre 2 y 120 caracteres'
          : undefined,
      email: validarEmail(datos.email),
      id_roles: requerido(datos.id_roles, 'Asigna al menos un rol'),
      password: !editando || datos.password ? passwordRegistro(datos.password ?? '') : undefined,
      id_sucursal:
        esEmpleado && !sucursales.data?.some((s) => s.id_sucursal === datos.id_sucursal)
          ? 'Selecciona una sucursal activa'
          : undefined,
    };
    setErrores(nuevos);
    if (hayErrores(nuevos) || dependenciasPendientes) return;

    try {
      await guardar.mutateAsync({ id: editando?.id_usuario, datos });
      toast.exito(editando ? 'Usuario actualizado.' : 'Usuario creado.');
      setEditando(undefined);
      if (editando?.id_usuario === auth.usuario?.id_usuario) {
        if (!datos.activo) await auth.cerrarSesion();
        else auth.reintentarSesion();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos guardar el usuario.');
    }
  }

  async function confirmarBaja() {
    if (!porDesactivar) return;
    try {
      await desactivar.mutateAsync(porDesactivar.id_usuario);
      toast.exito('Usuario desactivado.');
      if (porDesactivar.id_usuario === auth.usuario?.id_usuario) await auth.cerrarSesion();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos desactivar el usuario.');
    } finally {
      setPorDesactivar(null);
    }
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Organizacion</p>
          <h1>Usuarios</h1>
          <p className="fs-sub">Clientes, empleados y proveedores con acceso al sistema.</p>
        </div>
        <button type="button" className="fs-btn fs-btn--acento" onClick={() => setEditando(null)}>
          Nuevo usuario
        </button>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <div className="fs-fila-wrap">
          <div className="fs-campo fs-crecer" style={{ minWidth: 220 }}>
            <label htmlFor="buscar-usuario">Buscar</label>
            <input
              id="buscar-usuario"
              className="fs-input"
              placeholder="Nombre o correo"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="fs-campo" style={{ minWidth: 200 }}>
            <label htmlFor="filtro-rol">Rol</label>
            <select
              id="filtro-rol"
              className="fs-select"
              value={idRol}
              onChange={(e) => {
                setIdRol(e.target.value ? Number(e.target.value) : '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {roles.data?.map((r) => (
                <option key={r.id_rol} value={r.id_rol}>
                  {String(r.nombre)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {consulta.isPending && <FilasSkeleton />}
        {consulta.isError && (
          <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
        )}
        {consulta.data && consulta.data.items.length === 0 && (
          <Vacio titulo="Sin usuarios" mensaje="No hay usuarios que coincidan con el filtro." />
        )}

        {consulta.data && consulta.data.items.length > 0 && (
          <>
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Correo</th>
                    <th>Roles</th>
                    <th>Registro</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.items.map((u) => (
                    <tr key={u.id_usuario}>
                      <td>
                        {u.nombre}
                        {u.mayorista && <span className="fs-badge">Mayorista</span>}
                      </td>
                      <td className="fs-sub">{u.email}</td>
                      <td>
                        <div className="fs-fila-wrap" style={{ gap: 6 }}>
                          {u.roles.map((r) => (
                            <span key={r.id_rol} className="fs-badge">
                              {String(r.nombre)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{fecha(u.fecha_registro)}</td>
                      <td>
                        <BadgeActivo activo={u.activo} />
                      </td>
                      <td className="fs-td-acciones">
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno fs-btn--s"
                          onClick={() => setEditando(u)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="fs-btn fs-btn--contorno fs-btn--s"
                          onClick={() => setUsuarioRoles(u.id_usuario)}
                        >
                          Roles
                        </button>
                        {u.activo && (
                          <button
                            type="button"
                            className="fs-btn fs-btn--fantasma fs-btn--s"
                            onClick={() => setPorDesactivar(u)}
                          >
                            Desactivar
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

      <Modal
        abierto={editando !== undefined}
        titulo={editando ? 'Editar usuario' : 'Nuevo usuario'}
        onCerrar={() => setEditando(undefined)}
        ancho
        pie={
          <>
            <button
              type="button"
              className="fs-btn fs-btn--contorno"
              onClick={() => setEditando(undefined)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              onClick={enviar}
              disabled={guardar.isPending || dependenciasPendientes}
            >
              {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="fs-pila">
          {roles.isPending && <p>Cargando roles...</p>}
          {roles.isError && (
            <ErrorEstado error={roles.error} onReintentar={() => roles.refetch()} />
          )}
          {esEmpleado && sucursales.isError && (
            <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />
          )}
          <div className="fs-rejilla-form">
            <div className="fs-campo">
              <label htmlFor="nombre-usuario">Nombre completo</label>
              <input
                id="nombre-usuario"
                maxLength={120}
                className={`fs-input${errores.nombre ? ' fs-input--error' : ''}`}
                value={datos.nombre}
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              />
              {errores.nombre && <span className="fs-campo-error">{errores.nombre}</span>}
            </div>
            <div className="fs-campo">
              <label htmlFor="email-usuario">Correo</label>
              <input
                id="email-usuario"
                maxLength={180}
                type="email"
                className={`fs-input${errores.email ? ' fs-input--error' : ''}`}
                value={datos.email}
                onChange={(e) => setDatos({ ...datos, email: e.target.value })}
              />
              {errores.email && <span className="fs-campo-error">{errores.email}</span>}
            </div>
            <div className="fs-campo">
              <label htmlFor="password-usuario">
                {editando ? 'Nueva contrasena (opcional)' : 'Contrasena inicial'}
              </label>
              <input
                id="password-usuario"
                maxLength={72}
                type="password"
                className={`fs-input${errores.password ? ' fs-input--error' : ''}`}
                value={datos.password}
                onChange={(e) => setDatos({ ...datos, password: e.target.value })}
              />
              {errores.password && <span className="fs-campo-error">{errores.password}</span>}
            </div>
          </div>

          <div className="fs-campo">
            <label>Roles</label>
            <div className="fs-opciones">
              {roles.data?.map((r) => (
                <button
                  key={r.id_rol}
                  type="button"
                  className={`fs-chip${datos.id_roles.includes(r.id_rol) ? ' fs-chip--activo' : ''}`}
                  disabled={Boolean(editando)}
                  onClick={() => alternarRol(r.id_rol)}
                >
                  {String(r.nombre)}
                </button>
              ))}
            </div>
            {editando && (
              <span className="fs-campo-ayuda">
                Usa el boton Roles de la tabla para asignar o quitar permisos.
              </span>
            )}
            {errores.id_roles && <span className="fs-campo-error">{errores.id_roles}</span>}
          </div>

          {esProveedor && <div className="fs-campo">
            <label htmlFor="proveedor-usuario">Proveedor asociado</label>
            <select id="proveedor-usuario" className="fs-select" value={datos.id_proveedor ?? ''}
              onChange={e => setDatos({ ...datos, id_proveedor: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sin proveedor asociado</option>
              {proveedores.data?.filter(p => p.activo || p.id_proveedor === datos.id_proveedor).map(p =>
                <option key={p.id_proveedor} value={p.id_proveedor} disabled={!p.activo}>{p.nombre}{p.activo ? '' : ' (inactivo)'}</option>)}
            </select>
            <span className="fs-campo-ayuda">Asigna el proveedor cuyos productos puede gestionar. Sin asociacion activa no tendra acceso al panel.</span>
            {proveedores.isError && <ErrorEstado error={proveedores.error} onReintentar={() => proveedores.refetch()} />}
          </div>}
          {esCliente && (
            <label className="fs-check">
              <input
                type="checkbox"
                checked={datos.mayorista ?? false}
                onChange={(e) => setDatos({ ...datos, mayorista: e.target.checked })}
              />
              Cliente mayorista
            </label>
          )}
          {esCliente && (
            <div className="fs-rejilla-form">
              <div className="fs-campo">
                <label htmlFor="telefono-usuario">Telefono</label>
                <input
                  id="telefono-usuario"
                  maxLength={30}
                  className="fs-input"
                  value={datos.telefono}
                  onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
                />
              </div>
              <div className="fs-campo">
                <label htmlFor="direccion-usuario">Direccion</label>
                <input
                  id="direccion-usuario"
                  maxLength={250}
                  className="fs-input"
                  value={datos.direccion}
                  onChange={(e) => setDatos({ ...datos, direccion: e.target.value })}
                />
              </div>
            </div>
          )}
          {esEmpleado && (
            <div className="fs-rejilla-form">
              <div className="fs-campo">
                <label htmlFor="cargo-usuario">Cargo</label>
                <input
                  id="cargo-usuario"
                  maxLength={80}
                  className="fs-input"
                  value={datos.cargo}
                  onChange={(e) => setDatos({ ...datos, cargo: e.target.value })}
                />
              </div>
              <div className="fs-campo">
                <label htmlFor="sucursal-usuario">Sucursal asignada</label>
                <select
                  id="sucursal-usuario"
                  className="fs-select"
                  value={datos.id_sucursal ?? ''}
                  onChange={(e) =>
                    setDatos({
                      ...datos,
                      id_sucursal: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Sin sucursal</option>
                  {sucursales.data?.map((s) => (
                    <option key={s.id_sucursal} value={s.id_sucursal}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
                {errores.id_sucursal && (
                  <span className="fs-campo-error">{errores.id_sucursal}</span>
                )}
              </div>
            </div>
          )}

          <label className="fs-check">
            <input
              type="checkbox"
              checked={datos.activo}
              onChange={(e) => setDatos({ ...datos, activo: e.target.checked })}
            />
            Usuario activo
          </label>
        </div>
      </Modal>

      {usuarioRoles !== null && (
        <RolesUsuario id={usuarioRoles} onCerrar={() => setUsuarioRoles(null)} />
      )}

      <Confirmacion
        abierto={porDesactivar !== null}
        titulo="Desactivar usuario"
        mensaje="El usuario no podra iniciar sesion, pero se conserva su historial."
        textoConfirmar="Desactivar"
        peligro
        cargando={desactivar.isPending}
        onConfirmar={confirmarBaja}
        onCancelar={() => setPorDesactivar(null)}
      />
    </>
  );
}
