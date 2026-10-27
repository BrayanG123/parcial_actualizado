import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { tokenPlataforma } from '../../api/http';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { fecha } from '../../lib/format';
import { plataformaService, type NuevaEmpresa } from '../../services/plataforma.service';
import { ErrorApi } from '../../types/api';
import { ETIQUETA_ESTADO, NOMBRE_FUNCION, type EmpresaPlataforma, type Plan } from '../../types/saas';

const CLAVE = ['plataforma'] as const;
const mensaje = (e: unknown) => (e instanceof ErrorApi ? e.mensajes.join(' ') : 'No se pudo completar la operacion.');
const SUSCRIPCION_CLASE: Record<string, string> = {
  ACTIVE: 'fs-badge--exito',
  EXPIRED: 'fs-badge--error',
  SUSPENDED: 'fs-badge--alerta',
  CANCELLED: 'fs-badge--error',
};

/** F3.2: empresas, planes y suscripciones (administrador de plataforma). */
export default function PaginaPlataforma() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [creando, setCreando] = useState(false);
  const [historialDe, setHistorialDe] = useState<EmpresaPlataforma | null>(null);
  const empresas = useQuery({ queryKey: [...CLAVE, 'empresas'], queryFn: plataformaService.empresas, enabled: Boolean(tokenPlataforma()) });
  const planes = useQuery({ queryKey: [...CLAVE, 'planes'], queryFn: plataformaService.planes, enabled: Boolean(tokenPlataforma()) });
  const accion = useMutation({
    mutationFn: (operacion: () => Promise<unknown>) => operacion(),
    onSuccess: () => {
      toast.exito('Cambios guardados.');
      void qc.invalidateQueries({ queryKey: CLAVE });
    },
    onError: (e) => toast.error(mensaje(e)),
  });

  if (!tokenPlataforma()) return <Navigate to="/plataforma/login" replace />;

  function salir() {
    plataformaService.logout();
    qc.removeQueries({ queryKey: CLAVE });
    navegar('/plataforma/login');
  }

  return (
    <div className="fs-contenedor" style={{ paddingBlock: 24 }}>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">FashionStore SaaS</p>
          <h1>Plataforma</h1>
          <p className="fs-sub">Empresas contratantes, planes y suscripciones (contratacion simulada, sin cobro).</p>
        </div>
        <div className="fs-fila">
          <button type="button" className="fs-btn fs-btn--acento fs-btn--s" onClick={() => setCreando(true)}>
            Registrar empresa
          </button>
          <button type="button" className="fs-btn fs-btn--contorno fs-btn--s" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      <section className="fs-tarjeta fs-tarjeta--pad">
        <h2 className="fs-titulo-seccion">Empresas</h2>
        {empresas.isPending && <FilasSkeleton filas={3} />}
        {empresas.isError && <ErrorEstado error={empresas.error} onReintentar={() => empresas.refetch()} />}
        {empresas.data && (
          <div className="fs-tabla-scroll">
            <table className="fs-tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plan</th>
                  <th>Suscripcion</th>
                  <th>Vence</th>
                  <th className="fs-tabla-num">Sucursales activas</th>
                  <th className="fs-tabla-num">Usuarios</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empresas.data.map((empresa) => {
                  const s = empresa.suscripcion;
                  return (
                    <tr key={empresa.id}>
                      <td>
                        <strong>{empresa.nombre}</strong>
                        <span className="fs-sub" style={{ display: 'block' }}>
                          {empresa.slug} {empresa.estado === 'INACTIVE' && '· inactiva'}
                        </span>
                      </td>
                      <td>
                        <select
                          className="fs-input"
                          aria-label={`Plan de ${empresa.nombre}`}
                          value={s?.plan.codigo ?? ''}
                          disabled={accion.isPending}
                          onChange={(e) =>
                            accion.mutate(() => plataformaService.cambiarPlan(empresa.id, e.target.value))
                          }
                        >
                          {planes.data?.map((plan) => (
                            <option key={plan.id} value={plan.codigo}>
                              {plan.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {s && <span className={`fs-badge ${SUSCRIPCION_CLASE[s.estado] ?? ''}`}>{ETIQUETA_ESTADO[s.estado]}</span>}
                      </td>
                      <td>{s ? fecha(s.vencimiento) : '-'}</td>
                      <td className="fs-tabla-num">
                        {empresa.uso.sucursales_activas} / {s?.plan.max_sucursales_activas ?? '-'}
                      </td>
                      <td className="fs-tabla-num">{empresa.uso.usuarios}</td>
                      <td>
                        <div className="fs-fila-wrap">
                          <button
                            type="button"
                            className="fs-btn fs-btn--contorno fs-btn--s"
                            disabled={accion.isPending}
                            onClick={() => accion.mutate(() => plataformaService.renovar(empresa.id, 12))}
                          >
                            Renovar 12 meses
                          </button>
                          {s?.estado === 'SUSPENDED' ? (
                            <button
                              type="button"
                              className="fs-btn fs-btn--contorno fs-btn--s"
                              disabled={accion.isPending}
                              onClick={() => accion.mutate(() => plataformaService.reactivar(empresa.id))}
                            >
                              Reactivar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="fs-btn fs-btn--contorno fs-btn--s"
                              disabled={accion.isPending || s?.estado !== 'ACTIVE'}
                              onClick={() => accion.mutate(() => plataformaService.suspender(empresa.id))}
                            >
                              Suspender
                            </button>
                          )}
                          <button
                            type="button"
                            className="fs-btn fs-btn--fantasma fs-btn--s"
                            onClick={() => setHistorialDe(empresa)}
                          >
                            Historial
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fs-tarjeta fs-tarjeta--pad" style={{ marginTop: 24 }}>
        <h2 className="fs-titulo-seccion">Planes</h2>
        <p className="fs-sub">Los limites y funcionalidades se guardan en la base y se aplican de inmediato.</p>
        {planes.data?.map((plan) => (
          <EditorPlan key={plan.id} plan={plan} guardando={accion.isPending} onGuardar={(c) => accion.mutate(() => plataformaService.actualizarPlan(plan.id, c))} />
        ))}
      </section>

      <FormularioEmpresa
        abierto={creando}
        planes={planes.data ?? []}
        onCerrar={() => setCreando(false)}
        onCreada={() => {
          setCreando(false);
          void qc.invalidateQueries({ queryKey: CLAVE });
        }}
      />
      <HistorialSuscripcion empresa={historialDe} onCerrar={() => setHistorialDe(null)} />
    </div>
  );
}

function EditorPlan({
  plan,
  guardando,
  onGuardar,
}: {
  plan: Plan;
  guardando: boolean;
  onGuardar: (cambios: { max_sucursales_activas: number; funcionalidades: Plan['funcionalidades'] }) => void;
}) {
  const [maximo, setMaximo] = useState(plan.max_sucursales_activas);
  const [funciones, setFunciones] = useState(plan.funcionalidades);
  return (
    <div className="fs-tarjeta fs-tarjeta--pad" style={{ marginTop: 12 }}>
      <div className="fs-fila-entre">
        <strong>
          {plan.nombre} <span className="fs-sub">({plan.codigo})</span>
        </strong>
        <button
          type="button"
          className="fs-btn fs-btn--contorno fs-btn--s"
          disabled={guardando || maximo < 1}
          onClick={() => onGuardar({ max_sucursales_activas: maximo, funcionalidades: funciones })}
        >
          Guardar plan
        </button>
      </div>
      <div className="fs-fila-wrap" style={{ marginTop: 8 }}>
        <label className="fs-campo">
          Sucursales activas maximas
          <input
            type="number"
            min={1}
            className="fs-input"
            value={maximo}
            onChange={(e) => setMaximo(Number(e.target.value))}
          />
        </label>
        {Object.entries(NOMBRE_FUNCION).map(([clave, nombre]) => (
          <label key={clave} className="fs-fila">
            <input
              type="checkbox"
              checked={funciones[clave] === true}
              onChange={(e) => setFunciones({ ...funciones, [clave]: e.target.checked })}
            />
            {nombre}
          </label>
        ))}
      </div>
    </div>
  );
}

const VACIA: NuevaEmpresa = {
  nombre: '',
  slug: '',
  codigo_plan: 'BASIC',
  meses: 12,
  admin: { nombre: '', email: '', password: '' },
};

function FormularioEmpresa({
  abierto,
  planes,
  onCerrar,
  onCreada,
}: {
  abierto: boolean;
  planes: Plan[];
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState<NuevaEmpresa>(VACIA);
  const [error, setError] = useState('');
  const crear = useMutation({
    mutationFn: plataformaService.crearEmpresa,
    onSuccess: (empresa) => {
      toast.exito(`Empresa ${empresa.nombre} registrada.`);
      setDatos(VACIA);
      onCreada();
    },
    onError: (e) => setError(mensaje(e)),
  });
  const campo = (clave: 'nombre' | 'slug') => ({
    value: datos[clave],
    onChange: (e: { target: { value: string } }) => setDatos({ ...datos, [clave]: e.target.value }),
  });
  const admin = (clave: keyof NuevaEmpresa['admin']) => ({
    value: datos.admin[clave],
    onChange: (e: { target: { value: string } }) =>
      setDatos({ ...datos, admin: { ...datos.admin, [clave]: e.target.value } }),
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    crear.mutate(datos);
  }
  return (
    <Modal
      abierto={abierto}
      titulo="Registrar empresa"
      onCerrar={onCerrar}
      pie={
        <button type="submit" form="form-empresa" className="fs-btn fs-btn--acento" disabled={crear.isPending}>
          {crear.isPending ? 'Registrando...' : 'Registrar'}
        </button>
      }
    >
      <form id="form-empresa" className="fs-pila" onSubmit={enviar}>
        {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
        <label className="fs-campo">
          Nombre de la empresa
          <input className="fs-input" required minLength={2} {...campo('nombre')} />
        </label>
        <label className="fs-campo">
          Codigo (slug) para /t/codigo
          <input className="fs-input" required pattern="[a-z0-9-]{2,60}" {...campo('slug')} />
        </label>
        <label className="fs-campo">
          Plan
          <select
            className="fs-input"
            value={datos.codigo_plan}
            onChange={(e) => setDatos({ ...datos, codigo_plan: e.target.value })}
          >
            {planes.map((plan) => (
              <option key={plan.id} value={plan.codigo}>
                {plan.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="fs-campo">
          Meses de suscripcion
          <input
            type="number"
            min={1}
            max={36}
            className="fs-input"
            value={datos.meses}
            onChange={(e) => setDatos({ ...datos, meses: Number(e.target.value) })}
          />
        </label>
        <p className="fs-eyebrow">Administrador de la empresa</p>
        <label className="fs-campo">
          Nombre
          <input className="fs-input" required minLength={2} {...admin('nombre')} />
        </label>
        <label className="fs-campo">
          Correo
          <input type="email" className="fs-input" required {...admin('email')} />
        </label>
        <label className="fs-campo">
          Contrasena (mayuscula, minuscula y numero)
          <input type="password" className="fs-input" required minLength={8} {...admin('password')} />
        </label>
      </form>
    </Modal>
  );
}

function HistorialSuscripcion({ empresa, onCerrar }: { empresa: EmpresaPlataforma | null; onCerrar: () => void }) {
  const historial = useQuery({
    queryKey: [...CLAVE, 'historial', empresa?.id],
    queryFn: () => plataformaService.historial(empresa!.id),
    enabled: Boolean(empresa),
  });
  return (
    <Modal abierto={Boolean(empresa)} titulo={`Historial de ${empresa?.nombre ?? ''}`} onCerrar={onCerrar} ancho>
      {historial.isPending && <FilasSkeleton filas={3} />}
      {historial.isError && <ErrorEstado error={historial.error} />}
      {historial.data && (
        <table className="fs-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Accion</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Vigencia</th>
            </tr>
          </thead>
          <tbody>
            {historial.data.map((m) => (
              <tr key={m.id}>
                <td>{fecha(m.fecha)}</td>
                <td>{m.accion}</td>
                <td>
                  {m.plan_anterior && m.plan_anterior !== m.plan_nuevo ? `${m.plan_anterior} → ` : ''}
                  {m.plan_nuevo}
                </td>
                <td>{ETIQUETA_ESTADO[m.estado]}</td>
                <td>
                  {fecha(m.inicio)} – {fecha(m.vencimiento)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
