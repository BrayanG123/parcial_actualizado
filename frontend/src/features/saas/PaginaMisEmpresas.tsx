import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { esSlugValido, fijarEmpresa } from '../../api/empresa';
import { tokenCuenta } from '../../api/http';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { fecha, moneda } from '../../lib/format';
import { cuentaService, type EmpresaDueno } from '../../services/cuenta.service';
import { saasService, sugerirCodigo } from '../../services/saas.service';
import { ErrorApi } from '../../types/api';
import '../../styles/landing.css';

/**
 * F14 — "Mis empresas": portal de la cuenta de dueño. Muestra sus empresas con datos basicos
 * y permite crear otra (con su propio plan) o entrar a una; para operar dentro de una empresa
 * se usa la sesion de su administrador.
 */
export default function PaginaMisEmpresas() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { autenticado, cerrarSesion, entrarAEmpresa } = useAuth();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const conSesion = Boolean(tokenCuenta());

  const cuenta = useQuery({ queryKey: ['cuenta', 'perfil'], queryFn: cuentaService.perfil, enabled: conSesion, retry: false });
  const empresas = useQuery({ queryKey: ['cuenta', 'empresas'], queryFn: cuentaService.empresas, enabled: conSesion, retry: false });
  const entrar = useMutation({
    mutationFn: async (empresa: EmpresaDueno) => {
      // La sesion de empresa es de una sola empresa: se reemplaza la anterior.
      if (autenticado) await cerrarSesion();
      fijarEmpresa({ slug: empresa.slug, nombre: empresa.nombre });
      return entrarAEmpresa(empresa.id);
    },
    onSuccess: () => navegar('/admin'),
    onError: (e) => setError(e instanceof Error ? e.message : 'No pudimos entrar a la empresa.'),
  });

  if (!conSesion || cuenta.isError) return <Navigate to="/login?modo=dueno" replace />;

  async function salir() {
    cuentaService.salir();
    if (autenticado) await cerrarSesion();
    qc.removeQueries({ queryKey: ['cuenta'] });
    navegar('/');
  }

  const lista = empresas.data ?? [];
  const totalVentas = lista.reduce((suma, e) => suma + e.estadisticas.ventas_mes.total, 0);
  const moneda0 = lista[0]?.estadisticas.ventas_mes.moneda ?? 'BOB';

  return (
    <div className="fs-landing">
      <header className="fs-landing__barra">
        <div className="fs-contenedor fs-landing__barra-inner">
          <Link to="/" className="fs-marca">
            Fashion<span>Store</span>
            <small className="fs-landing__etiqueta">SaaS</small>
          </Link>
          <div className="fs-landing__acciones" style={{ marginLeft: 'auto', alignItems: 'center' }}>
            <span className="fs-sub">{cuenta.data?.nombre}</span>
            <button type="button" className="fs-btn fs-btn--contorno" onClick={() => void salir()}>
              Cerrar sesion
            </button>
          </div>
        </div>
      </header>

      <main className="fs-contenedor fs-seccion fs-pila" style={{ gap: 24 }}>
        <div className="fs-fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <p className="fs-eyebrow">Mi cuenta</p>
            <h1>Mis empresas</h1>
            <p className="fs-sub">Elige una empresa para administrarla o crea otra con su propio plan.</p>
          </div>
          {!creando && (
            <button type="button" className="fs-btn fs-btn--acento" onClick={() => setCreando(true)}>
              Crear otra empresa
            </button>
          )}
        </div>

        {error && <div className="fs-alerta fs-alerta--error">{error}</div>}

        {lista.length > 0 && (
          <div className="fs-portal__resumen">
            <Dato valor={lista.length} texto={lista.length === 1 ? 'empresa' : 'empresas'} />
            <Dato
              valor={lista.reduce((s, e) => s + e.estadisticas.sucursales_activas, 0)}
              texto="sucursales activas"
            />
            <Dato valor={lista.reduce((s, e) => s + e.estadisticas.personal, 0)} texto="personas en tu equipo" />
            <Dato valor={moneda(totalVentas, moneda0)} texto="vendido este mes" />
          </div>
        )}

        {creando && (
          <NuevaEmpresa
            onCancelar={() => setCreando(false)}
            onCreada={async () => {
              setCreando(false);
              await qc.invalidateQueries({ queryKey: ['cuenta', 'empresas'] });
            }}
          />
        )}

        {empresas.isPending && <FilasSkeleton filas={3} />}
        {empresas.isError && <ErrorEstado error={empresas.error} onReintentar={() => empresas.refetch()} />}

        <div className="fs-portal__empresas">
          {lista.map((e) => (
            <article key={e.id} className="fs-tarjeta fs-tarjeta--pad fs-portal__empresa">
              <div className="fs-fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem' }}>{e.nombre}</h2>
                  <p className="fs-sub">Codigo: {e.slug}</p>
                </div>
                {e.plan && <span className="fs-badge fs-badge--acento">{e.plan.nombre}</span>}
              </div>
              <p className="fs-sub">
                {!e.activa
                  ? 'Empresa inactiva'
                  : e.suscripcion?.solo_lectura
                    ? 'Suscripcion vencida o suspendida: solo lectura'
                    : `Suscripcion activa hasta ${fecha(e.suscripcion?.vence ?? '')}`}
                {e.plan && ` · ${e.plan.precio_mensual > 0 ? `$${e.plan.precio_mensual} USD/mes` : 'Gratis'}`}
              </p>
              <dl className="fs-portal__datos">
                <Par
                  titulo="Sucursales activas"
                  valor={`${e.estadisticas.sucursales_activas} de ${e.plan?.max_sucursales ?? '-'}`}
                />
                <Par titulo="Personal" valor={e.estadisticas.personal} />
                <Par titulo="Clientes" valor={e.estadisticas.clientes} />
                <Par titulo="Prendas" valor={e.estadisticas.prendas} />
                <Par
                  titulo="Ventas del mes"
                  valor={`${e.estadisticas.ventas_mes.cantidad} · ${moneda(e.estadisticas.ventas_mes.total, e.estadisticas.ventas_mes.moneda)}`}
                />
                <Par titulo="Reservas abiertas" valor={e.estadisticas.reservas_abiertas} />
              </dl>
              <div className="fs-fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="fs-btn fs-btn--acento"
                  disabled={!e.activa || entrar.isPending}
                  onClick={() => {
                    setError('');
                    entrar.mutate(e);
                  }}
                >
                  {entrar.isPending && entrar.variables?.id === e.id ? 'Entrando...' : 'Entrar a la empresa'}
                </button>
                <a className="fs-btn fs-btn--contorno" href={`/t/${e.slug}`}>
                  Ver tienda publica
                </a>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function Dato({ valor, texto }: { valor: string | number; texto: string }) {
  return (
    <div className="fs-tarjeta fs-tarjeta--pad">
      <strong className="fs-portal__numero">{valor}</strong>
      <span className="fs-sub">{texto}</span>
    </div>
  );
}

function Par({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div>
      <dt className="fs-sub">{titulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

/** Otra empresa: plan + nombre + codigo; el administrador es el propio dueño. */
function NuevaEmpresa({ onCancelar, onCreada }: { onCancelar: () => void; onCreada: () => Promise<void> }) {
  const planes = useQuery({ queryKey: ['saas', 'planes'], queryFn: saasService.planes });
  const [plan, setPlan] = useState('');
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEditado, setCodigoEditado] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const elegido = planes.data?.find((p) => p.codigo === plan) ?? planes.data?.[0];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const slug = codigo.trim().toLowerCase();
    if (nombre.trim().length < 2) return setError('Ingresa el nombre de la empresa.');
    if (!esSlugValido(slug)) return setError('El codigo usa solo minusculas, numeros y guiones.');
    if (!elegido) return;
    setEnviando(true);
    setError('');
    try {
      await cuentaService.crearEmpresa({ nombre, slug, plan: elegido.codigo });
      await onCreada();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.mensajes.join(' ') : 'No pudimos crear la empresa.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="fs-tarjeta fs-tarjeta--pad fs-pila" onSubmit={enviar} noValidate>
      <h2 style={{ fontSize: '1.2rem' }}>Nueva empresa</h2>
      <p className="fs-sub">
        Cada empresa tiene su propio plan, sucursales, equipo y clientes. Seras su administrador con tu
        misma cuenta.
      </p>
      {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
      <div className="fs-registro-planes" role="radiogroup" aria-label="Plan">
        {planes.data?.map((p) => (
          <button
            key={p.codigo}
            type="button"
            role="radio"
            aria-checked={elegido?.codigo === p.codigo}
            className={`fs-registro-plan${elegido?.codigo === p.codigo ? ' fs-registro-plan--activo' : ''}`}
            onClick={() => setPlan(p.codigo)}
          >
            <strong>{p.nombre}</strong>
            <span className="fs-sub">
              {p.precio_mensual > 0 ? `$${p.precio_mensual.toFixed(0)} USD/mes` : 'Gratis'} · {p.max_sucursales}{' '}
              {p.max_sucursales === 1 ? 'sucursal' : 'sucursales'}
            </span>
          </button>
        ))}
      </div>
      <div className="fs-campo">
        <label htmlFor="nueva-empresa">Nombre de la empresa</label>
        <input
          id="nueva-empresa"
          className="fs-input"
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            if (!codigoEditado) setCodigo(sugerirCodigo(e.target.value));
          }}
        />
      </div>
      <div className="fs-campo">
        <label htmlFor="nuevo-codigo">Codigo de la empresa</label>
        <input
          id="nuevo-codigo"
          className="fs-input"
          value={codigo}
          onChange={(e) => {
            setCodigoEditado(true);
            setCodigo(e.target.value.toLowerCase());
          }}
        />
        {codigo && <span className="fs-sub">Tienda publica: /t/{codigo}</span>}
      </div>
      <div className="fs-fila" style={{ gap: 8 }}>
        <button type="submit" className="fs-btn fs-btn--acento" disabled={enviando || !elegido}>
          {enviando ? 'Creando...' : `Crear con plan ${elegido?.nombre ?? ''}`}
        </button>
        <button type="button" className="fs-btn fs-btn--fantasma" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
