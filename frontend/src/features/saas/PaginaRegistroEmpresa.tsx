import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { esSlugValido, fijarEmpresa } from '../../api/empresa';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import {
  email as validarEmail,
  hayErrores,
  longitudMinima,
  passwordRegistro,
  requerido,
  type Errores,
} from '../../lib/validacion';
import { saasService, sugerirCodigo } from '../../services/saas.service';
import { cuentaService } from '../../services/cuenta.service';
import { ErrorApi } from '../../types/api';
import '../../styles/landing.css';

interface Campos {
  empresa: string;
  codigo: string;
  nombre: string;
  email: string;
  password: string;
  confirmacion: string;
}

/**
 * Alta autoservicio de una empresa (landing SaaS): plan + datos de la tienda + administrador.
 * Al terminar inicia sesion con la cuenta nueva y abre el panel de administracion.
 */
export default function PaginaRegistroEmpresa() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { autenticado, cerrarSesion } = useAuth();
  const planes = useQuery({ queryKey: ['saas', 'planes'], queryFn: saasService.planes });

  const [plan, setPlan] = useState(params.get('plan') ?? '');
  const [campos, setCampos] = useState<Campos>({
    empresa: '',
    codigo: '',
    nombre: '',
    email: '',
    password: '',
    confirmacion: '',
  });
  const [codigoEditado, setCodigoEditado] = useState(false);
  const [errores, setErrores] = useState<Errores<Campos>>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  const planElegido = planes.data?.find((p) => p.codigo === plan) ?? planes.data?.[0];

  function cambiar<K extends keyof Campos>(campo: K, valor: string) {
    setCampos((actual) => {
      const siguiente = { ...actual, [campo]: valor };
      // El codigo sigue al nombre hasta que el usuario lo edita a mano.
      if (campo === 'empresa' && !codigoEditado) siguiente.codigo = sugerirCodigo(valor);
      return siguiente;
    });
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || !planElegido) return;
    const codigo = campos.codigo.trim().toLowerCase();
    const nuevos: Errores<Campos> = {
      empresa: requerido(campos.empresa.trim(), 'Ingresa el nombre de tu empresa') ?? longitudMinima(campos.empresa.trim(), 2),
      codigo: !codigo
        ? 'Ingresa el codigo de tu empresa'
        : esSlugValido(codigo)
          ? undefined
          : 'Usa solo minusculas, numeros y guiones (sin espacios ni guion al inicio o al final)',
      nombre: requerido(campos.nombre.trim(), 'Ingresa tu nombre') ?? longitudMinima(campos.nombre.trim(), 2),
      email: validarEmail(campos.email),
      password: passwordRegistro(campos.password),
      confirmacion: campos.confirmacion === campos.password ? undefined : 'Las contrasenas no coinciden',
    };
    setErrores(nuevos);
    if (hayErrores(nuevos)) return;

    setEnviando(true);
    setErrorGeneral('');
    try {
      const empresa = await saasService.registrarEmpresa({
        nombre: campos.empresa,
        slug: codigo,
        plan: planElegido.codigo,
        admin: { nombre: campos.nombre, email: campos.email, password: campos.password },
      });
      // F14: el registro crea la cuenta de dueño; se entra a "Mis empresas" con ella.
      if (autenticado) await cerrarSesion();
      fijarEmpresa({ slug: empresa.slug, nombre: empresa.nombre });
      await cuentaService.login(campos.email.trim(), campos.password);
      navegar('/cuenta', { replace: true });
    } catch (error) {
      setErrorGeneral(
        error instanceof ErrorApi
          ? error.mensajes.join(' ')
          : error instanceof Error
            ? error.message
            : 'No pudimos registrar tu empresa.',
      );
    } finally {
      setEnviando(false);
    }
  }

  function campo(id: keyof Campos, etiqueta: string, tipo = 'text', extra?: { autoComplete?: string; ayuda?: string }) {
    return (
      <div className="fs-campo">
        <label htmlFor={id}>{etiqueta}</label>
        <input
          id={id}
          type={tipo}
          autoComplete={extra?.autoComplete}
          className={`fs-input${errores[id] ? ' fs-input--error' : ''}`}
          value={campos[id]}
          onChange={(e) => {
            if (id === 'codigo') setCodigoEditado(true);
            cambiar(id, id === 'codigo' ? e.target.value.toLowerCase() : e.target.value);
          }}
        />
        {extra?.ayuda && !errores[id] && <span className="fs-sub">{extra.ayuda}</span>}
        {errores[id] && <span className="fs-campo-error">{errores[id]}</span>}
      </div>
    );
  }

  return (
    <div className="fs-auth">
      <aside className="fs-auth__lado">
        <Link to="/" className="fs-marca" style={{ color: '#fff' }}>
          Fashion<span style={{ color: 'var(--fs-oro)' }}>Store</span>
        </Link>
        <h2>Registra tu tienda de ropa</h2>
        <p style={{ color: 'rgba(250,247,243,.8)', maxWidth: '38ch' }}>
          Tu empresa tendra su propio entorno: sucursales, empleados, clientes, catalogo, inventario,
          ventas y reportes, sin acceso de otras empresas.
        </p>
        {planElegido && (
          <p style={{ color: 'rgba(250,247,243,.8)' }}>
            Plan elegido: <strong style={{ color: '#fff' }}>{planElegido.nombre}</strong>
            {planElegido.precio_mensual > 0 ? ` · $${planElegido.precio_mensual.toFixed(0)} USD/mes` : ' · Gratis'}
          </p>
        )}
      </aside>

      <div className="fs-auth__form">
        <form className="fs-auth__caja" onSubmit={enviar} noValidate>
          <div>
            <p className="fs-eyebrow">Nueva empresa</p>
            <h1>Crear cuenta de empresa</h1>
          </div>

          {errorGeneral && <div className="fs-alerta fs-alerta--error">{errorGeneral}</div>}

          <fieldset className="fs-pila" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="fs-eyebrow" style={{ marginBottom: 8 }}>1. Plan</legend>
            {planes.isPending && <FilasSkeleton filas={1} />}
            {planes.isError && <ErrorEstado error={planes.error} onReintentar={() => planes.refetch()} />}
            <div className="fs-registro-planes" role="radiogroup" aria-label="Plan">
              {planes.data?.map((p) => (
                <button
                  key={p.codigo}
                  type="button"
                  role="radio"
                  aria-checked={planElegido?.codigo === p.codigo}
                  className={`fs-registro-plan${planElegido?.codigo === p.codigo ? ' fs-registro-plan--activo' : ''}`}
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
          </fieldset>

          <p className="fs-eyebrow" style={{ marginBottom: -8 }}>2. Tu empresa</p>
          {campo('empresa', 'Nombre de la empresa', 'text', { autoComplete: 'organization' })}
          {campo('codigo', 'Codigo de la empresa', 'text', {
            ayuda: campos.codigo
              ? `Tu tienda: /t/${campos.codigo} · tu equipo lo usara para iniciar sesion`
              : 'Lo usaran tu equipo y tus clientes para entrar a tu tienda',
          })}

          <p className="fs-eyebrow" style={{ marginBottom: -8 }}>3. Administrador</p>
          {campo('nombre', 'Tu nombre', 'text', { autoComplete: 'name' })}
          {campo('email', 'Correo electronico', 'email', { autoComplete: 'email' })}
          {campo('password', 'Contrasena', 'password', {
            autoComplete: 'new-password',
            ayuda: 'Minimo 8 caracteres, con mayuscula, minuscula y numero',
          })}
          {campo('confirmacion', 'Repite la contrasena', 'password', { autoComplete: 'new-password' })}

          <button type="submit" className="fs-btn fs-btn--acento fs-btn--bloque" disabled={enviando || !planElegido}>
            {enviando ? 'Creando tu empresa...' : 'Crear empresa y entrar'}
          </button>

          <p className="fs-sub">
            Ya tienes cuenta? <Link to="/login?modo=dueno" style={{ color: 'var(--fs-acento)' }}>Inicia sesion</Link>
          </p>
          <p className="fs-sub">
            <Link to="/" style={{ color: 'var(--fs-acento)' }}>Volver al inicio</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
