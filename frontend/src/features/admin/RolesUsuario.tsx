import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { ErrorEstado } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useRoles, useSucursales } from '../../hooks/useOperaciones';
import { rolesService, usuariosService } from '../../services/organizacion.service';
import { RolNombre, type Rol } from '../../types/domain';

export function RolesUsuario({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const roles = useRoles();
  const sucursales = useSucursales();
  const consulta = useQuery({
    queryKey: ['usuarios', 'detalle', id],
    queryFn: () => usuariosService.obtener(id),
  });
  const [seleccion, setSeleccion] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [cargo, setCargo] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const auth = useAuth();
  const toast = useToast();
  const rol = roles.data?.find((r) => r.id_rol === Number(seleccion));
  const empleado = rol?.nombre === RolNombre.CAJERO || rol?.nombre === RolNombre.ENCARGADO_SUCURSAL;
  const cambio = useMutation({
    mutationFn: ({ rol, quitar }: { rol: Rol; quitar: boolean }) =>
      quitar
        ? rolesService.revocar(id, rol)
        : rolesService.asignar(id, rol, empleado ? { id_sucursal: Number(sucursal), cargo } : {}),
    onSuccess: (usuario) => {
      qc.setQueryData(['usuarios', 'detalle', id], usuario);
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
      setSeleccion('');
      setSucursal('');
      setCargo('');
      setError('');
      toast.exito('Roles actualizados.');
      if (auth.usuario?.id_usuario === id) {
        onCerrar();
        auth.reintentarSesion();
      }
    },
    onError: (e) => setError(e.message),
  });
  function asignar() {
    if (!rol) {
      setError('Selecciona un rol');
      return;
    }
    if (empleado && !sucursales.data?.some((s) => s.id_sucursal === Number(sucursal))) {
      setError('Selecciona una sucursal activa');
      return;
    }
    cambio.mutate({ rol, quitar: false });
  }
  return (
    <Modal abierto titulo="Administrar roles" onCerrar={() => !cambio.isPending && onCerrar()}>
      <div className="fs-pila">
        {consulta.isPending && <p>Cargando usuario...</p>}
        {consulta.isError && (
          <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />
        )}
        {roles.isError && <ErrorEstado error={roles.error} onReintentar={() => roles.refetch()} />}
        {consulta.data && (
          <>
            <p>
              Permisos de {consulta.data.nombre}. Cada cambio se guarda al pulsar Asignar o Quitar.
            </p>
            {consulta.data.roles.map((r) => (
              <div className="fs-fila-wrap" key={r.id_rol}>
                <span className="fs-badge">{r.nombre}</span>
                <button
                  type="button"
                  className="fs-btn fs-btn--contorno fs-btn--s"
                  disabled={cambio.isPending || consulta.data.roles.length === 1}
                  onClick={() => cambio.mutate({ rol: r, quitar: true })}
                >
                  Quitar {r.nombre}
                </button>
              </div>
            ))}
            <p className="fs-sub">
              El usuario debe conservar al menos un rol. Los datos de sus perfiles se editan en
              Usuarios.
            </p>
            <div className="fs-campo">
              <label htmlFor="asignar-rol">Agregar rol</label>
              <select
                id="asignar-rol"
                className="fs-select"
                value={seleccion}
                disabled={cambio.isPending || !roles.data}
                onChange={(e) => {
                  setSeleccion(e.target.value);
                  setError('');
                }}
              >
                <option value="">Selecciona</option>
                {roles.data
                  ?.filter((r) => !consulta.data.roles.some((actual) => actual.id_rol === r.id_rol))
                  .map((r) => (
                    <option key={r.id_rol} value={r.id_rol}>
                      {r.nombre}
                    </option>
                  ))}
              </select>
            </div>
            {empleado && (
              <>
                {sucursales.isError && (
                  <ErrorEstado error={sucursales.error} onReintentar={() => sucursales.refetch()} />
                )}
                <div className="fs-campo">
                  <label htmlFor="rol-sucursal">Sucursal del empleado</label>
                  <select
                    id="rol-sucursal"
                    className="fs-select"
                    value={sucursal}
                    onChange={(e) => setSucursal(e.target.value)}
                  >
                    <option value="">Selecciona</option>
                    {sucursales.data?.map((s) => (
                      <option key={s.id_sucursal} value={s.id_sucursal}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fs-campo">
                  <label htmlFor="rol-cargo">Cargo (opcional)</label>
                  <input
                    id="rol-cargo"
                    className="fs-input"
                    value={cargo}
                    maxLength={80}
                    onChange={(e) => setCargo(e.target.value)}
                  />
                </div>
              </>
            )}
            {error && (
              <p className="fs-campo-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={!rol || cambio.isPending || (empleado && !sucursales.data)}
              onClick={asignar}
            >
              {cambio.isPending ? 'Guardando...' : 'Asignar rol'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
