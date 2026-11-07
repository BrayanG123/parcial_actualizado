import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { USAR_MOCKS } from '../../api/config';
import { useEmpresaActiva } from '../../hooks/useEmpresaActiva';
import { esSlugValido, fijarEmpresa, obtenerEmpresa } from '../../api/empresa';
import { empresaService } from '../../services/empresa.service';
import { cuentaService } from '../../services/cuenta.service';
import '../../styles/landing.css';
import { ErrorApi } from '../../types/api';
import { puedeAcceder, rutaInicialPorRol } from '../../routes/permisos';
import { email as validarEmail, hayErrores, requerido, type Errores } from '../../lib/validacion';

interface Campos {
  codigo: string;
  email: string;
  password: string;
}

/** Cuentas del mock para facilitar la demostracion academica. */
const CUENTAS_DEMO = [
  { rol: 'Administrador', email: 'admin@fashionstore.bo', password: 'admin123' },
  { rol: 'Encargado de sucursal', email: 'encargado@fashionstore.bo', password: 'encargado123' },
  { rol: 'Cajero', email: 'cajero@fashionstore.bo', password: 'cajero123' },
  { rol: 'Cliente', email: 'cliente@fashionstore.bo', password: 'cliente123' },
  { rol: 'Proveedor', email: 'proveedor@fashionstore.bo', password: 'proveedor123' },
];

export default function PaginaLogin() {
  const { autenticado, cerrarSesion, iniciarSesion } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const destino = (ubicacion.state as { desde?: string } | null)?.desde;
  const [params] = useSearchParams();
  // F14: el dueño entra con su cuenta (sin codigo) a "Mis empresas"; el personal y los
  // clientes entran con el codigo de la tienda.
  const [modo, setModo] = useState<'dueno' | 'tienda'>(() => {
    const pedido = params.get('modo');
    if (pedido === 'dueno' || pedido === 'tienda') return pedido;
    return obtenerEmpresa() || destino ? 'tienda' : 'dueno';
  });

  const [campos, setCampos] = useState<Campos>(() => ({
    codigo: obtenerEmpresa()?.slug ?? '',
    email: '',
    password: '',
  }));
  const [errores, setErrores] = useState<Errores<Campos>>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const empresa = useEmpresaActiva();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;

    const codigo = campos.codigo.trim().toLowerCase();
    const nuevos: Errores<Campos> = {
      codigo:
        modo === 'dueno'
          ? undefined
          : !codigo
            ? 'Ingresa el codigo de tu empresa'
            : esSlugValido(codigo)
              ? undefined
              : 'Codigo de empresa invalido',
      email: validarEmail(campos.email),
      password: requerido(campos.password, 'Ingresa tu contrasena'),
    };
    setErrores(nuevos);
    if (hayErrores(nuevos)) return;

    setEnviando(true);
    setErrorGeneral('');
    try {
      if (modo === 'dueno') {
        await cuentaService.login(campos.email, campos.password);
        navegar('/cuenta', { replace: true });
        return;
      }
      // El codigo define la empresa (X-Tenant) del login; una sesion pertenece a una sola empresa.
      const anterior = obtenerEmpresa();
      const cambiaDeTienda = anterior?.slug !== codigo;
      if (cambiaDeTienda) {
        if (autenticado) await cerrarSesion();
        fijarEmpresa({ slug: codigo });
        try {
          const empresa = await empresaService.publica();
          fijarEmpresa({ slug: empresa.slug, nombre: empresa.nombre });
        } catch {
          fijarEmpresa(anterior);
          throw new Error('No encontramos una empresa activa con ese codigo.');
        }
      }
      const usuario = await iniciarSesion({ email: campos.email, password: campos.password });
      const roles = usuario.roles.map((r) => String(r.nombre));
      // Solo volvemos a la ruta previa si el usuario que acaba de entrar
      // tiene permiso sobre ella; si no, va al inicio de su propio rol.
      const inicio = rutaInicialPorRol(roles);
      // Con el codigo de otra tienda se entra a esa tienda (la ruta previa era de la anterior).
      const volver = !cambiaDeTienda && destino && puedeAcceder(destino, roles);
      navegar(volver ? destino : inicio, { replace: true });
    } catch (error) {
      setErrorGeneral(error instanceof ErrorApi ? error.mensajes.join(' ') : error instanceof Error ? error.message : 'No pudimos iniciar sesion.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fs-auth">
      <aside className="fs-auth__lado">
        <p className="fs-marca" style={{ color: '#fff' }}>
          Fashion<span style={{ color: 'var(--fs-oro)' }}>Store</span>
        </p>
        <h2>{modo === 'dueno' ? 'Administra tus empresas' : 'Entra a tu tienda'}</h2>
        <p style={{ color: 'rgba(250,247,243,.8)', maxWidth: '38ch' }}>
          {modo === 'dueno'
            ? 'Con tu cuenta de dueño ves todas tus empresas, sus datos y creas otras con su propio plan.'
            : 'Encargados y cajeros van a su panel; los clientes, a la tienda de la empresa.'}
        </p>
      </aside>

      <div className="fs-auth__form">
        <form className="fs-auth__caja" onSubmit={enviar} noValidate>
          <div>
            <p className="fs-eyebrow">Bienvenida de vuelta</p>
            <h1>Iniciar sesion</h1>
          </div>

          <div className="fs-segmento" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={modo === 'dueno'}
              className={`fs-segmento__opcion${modo === 'dueno' ? ' fs-segmento__opcion--activa' : ''}`}
              onClick={() => setModo('dueno')}
            >
              Dueño de empresa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modo === 'tienda'}
              className={`fs-segmento__opcion${modo === 'tienda' ? ' fs-segmento__opcion--activa' : ''}`}
              onClick={() => setModo('tienda')}
            >
              Personal o cliente
            </button>
          </div>

          {errorGeneral && <div className="fs-alerta fs-alerta--error">{errorGeneral}</div>}

          {modo === 'tienda' && <div className="fs-campo">
            <label htmlFor="codigo">Codigo de empresa</label>
            <input
              id="codigo"
              type="text"
              autoComplete="organization"
              placeholder="ej. mi-tienda"
              className={`fs-input${errores.codigo ? ' fs-input--error' : ''}`}
              value={campos.codigo}
              onChange={(e) => setCampos({ ...campos, codigo: e.target.value.toLowerCase() })}
            />
            {errores.codigo && <span className="fs-campo-error">{errores.codigo}</span>}
          </div>}

          <div className="fs-campo">
            <label htmlFor="email">Correo electronico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={`fs-input${errores.email ? ' fs-input--error' : ''}`}
              value={campos.email}
              onChange={(e) => setCampos({ ...campos, email: e.target.value })}
            />
            {errores.email && <span className="fs-campo-error">{errores.email}</span>}
          </div>

          <div className="fs-campo">
            <label htmlFor="password">Contrasena</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={`fs-input${errores.password ? ' fs-input--error' : ''}`}
              value={campos.password}
              onChange={(e) => setCampos({ ...campos, password: e.target.value })}
            />
            {errores.password && <span className="fs-campo-error">{errores.password}</span>}
          </div>

          <button type="submit" className="fs-btn fs-btn--acento fs-btn--bloque" disabled={enviando}>
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>

          {modo === 'tienda' && empresa && (
            <p className="fs-sub">
              Eres cliente de {empresa.nombre ?? empresa.slug}?{' '}
              <Link to="/registro" style={{ color: 'var(--fs-acento)' }}>Crea tu cuenta</Link>
            </p>
          )}
          <p className="fs-sub">
            Tu empresa aun no usa FashionStore?{' '}
            <Link to="/registro-empresa" style={{ color: 'var(--fs-acento)' }}>Registrala</Link>
          </p>
          <p className="fs-sub">
            Administras la plataforma? <Link to="/plataforma/login" style={{ color: 'var(--fs-acento)' }}>Acceso de plataforma</Link>
          </p>
          <p className="fs-sub">
            <Link to="/" style={{ color: 'var(--fs-acento)' }}>Volver al inicio</Link>
          </p>

          {USAR_MOCKS && <div className="fs-pila" style={{ gap: 8 }}>
            <p className="fs-eyebrow">Cuentas de prueba</p>
            <div className="fs-demo-cuentas">
              {CUENTAS_DEMO.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  className="fs-demo-cuenta"
                  onClick={() => setCampos({ codigo: campos.codigo || 'fashionstore', email: c.email, password: c.password })}
                >
                  <span>{c.rol}</span>
                  <span className="fs-sub">{c.email}</span>
                </button>
              ))}
            </div>
          </div>}
        </form>
      </div>
    </div>
  );
}
