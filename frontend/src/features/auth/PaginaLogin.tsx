import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { USAR_MOCKS } from '../../api/config';
import { ErrorApi } from '../../types/api';
import { puedeAcceder, rutaInicialPorRol } from '../../routes/permisos';
import { email as validarEmail, hayErrores, requerido, type Errores } from '../../lib/validacion';

interface Campos {
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
  const { iniciarSesion } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const destino = (ubicacion.state as { desde?: string } | null)?.desde;

  const [campos, setCampos] = useState<Campos>({ email: '', password: '' });
  const [errores, setErrores] = useState<Errores<Campos>>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;

    const nuevos: Errores<Campos> = {
      email: validarEmail(campos.email),
      password: requerido(campos.password, 'Ingresa tu contrasena'),
    };
    setErrores(nuevos);
    if (hayErrores(nuevos)) return;

    setEnviando(true);
    setErrorGeneral('');
    try {
      const usuario = await iniciarSesion(campos);
      const roles = usuario.roles.map((r) => String(r.nombre));
      // Solo volvemos a la ruta previa si el usuario que acaba de entrar
      // tiene permiso sobre ella; si no, va al inicio de su propio rol.
      const inicio = rutaInicialPorRol(roles);
      navegar(destino && puedeAcceder(destino, roles) ? destino : inicio, { replace: true });
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
        <h2>Una plataforma, todos los canales</h2>
        <p style={{ color: 'rgba(250,247,243,.8)', maxWidth: '38ch' }}>
          Catalogo, reservas en sucursal, caja presencial, inventario y reportes en un mismo lugar.
        </p>
      </aside>

      <div className="fs-auth__form">
        <form className="fs-auth__caja" onSubmit={enviar} noValidate>
          <div>
            <p className="fs-eyebrow">Bienvenida de vuelta</p>
            <h1>Iniciar sesion</h1>
          </div>

          {errorGeneral && <div className="fs-alerta fs-alerta--error">{errorGeneral}</div>}

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

          <p className="fs-sub">
            No tienes cuenta? <Link to="/registro" style={{ color: 'var(--fs-acento)' }}>Crea una aqui</Link>
          </p>

          {USAR_MOCKS && <div className="fs-pila" style={{ gap: 8 }}>
            <p className="fs-eyebrow">Cuentas de prueba</p>
            <div className="fs-demo-cuentas">
              {CUENTAS_DEMO.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  className="fs-demo-cuenta"
                  onClick={() => setCampos({ email: c.email, password: c.password })}
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
