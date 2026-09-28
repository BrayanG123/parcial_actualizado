/** Shell de las areas internas: administracion, sucursal, caja y proveedor. */
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AvisosPush } from '../features/notifications/AvisosPush';
import { CampanaNotificaciones } from '../features/notifications/CampanaNotificaciones';
import { RolNombre } from '../types/domain';
import { iniciales } from '../lib/format';
import { navegacionPorRol } from '../routes/navegacion';

export function LayoutPanel() {
  const { usuario, roles, cerrarSesion, tieneRol } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const navegar = useNavigate();
  const grupos = navegacionPorRol(roles);
  // NestJS solo notifica a administradores y encargados.
  const rutaReservas = tieneRol(RolNombre.ADMINISTRADOR)
    ? '/admin/reservas'
    : tieneRol(RolNombre.ENCARGADO_SUCURSAL)
      ? '/sucursal/reservas'
      : null;
  // Avisos push de compras: el personal que atiende ventas.
  const recibeCompras = tieneRol(RolNombre.ADMINISTRADOR, RolNombre.ENCARGADO_SUCURSAL, RolNombre.CAJERO);

  async function salir() {
    await cerrarSesion();
    navegar('/login');
  }

  return (
    <div className="fs-panel-shell">
      <aside className={`fs-sidebar${abierto ? ' fs-sidebar--abierto' : ''}`}>
        <Link to="/" className="fs-marca fs-marca--panel">
          Fashion<span>Store</span>
        </Link>

        <nav className="fs-sidebar__nav">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="fs-sidebar__grupo">
              <p className="fs-eyebrow">{grupo.titulo}</p>
              {grupo.enlaces.map((enlace) => (
                <NavLink
                  key={enlace.a}
                  to={enlace.a}
                  end={enlace.exacto}
                  className={({ isActive }) => `fs-sidebar__enlace${isActive ? ' activo' : ''}`}
                  onClick={() => setAbierto(false)}
                >
                  {enlace.texto}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="fs-sidebar__pie">
          <Link to="/" className="fs-sidebar__enlace">Ir a la tienda</Link>
        </div>
      </aside>

      <div className="fs-panel-cuerpo">
        <header className="fs-panel-top">
          <button
            type="button"
            className="fs-btn fs-btn--fantasma fs-panel-top__hamburguesa"
            onClick={() => setAbierto((v) => !v)}
            aria-label="Abrir menu lateral"
          >
            &#9776;
          </button>
          <div className="fs-crecer" />
          <div className="fs-fila">
            {recibeCompras && <AvisosPush />}
            {rutaReservas && <CampanaNotificaciones rutaReservas={rutaReservas} />}
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{usuario?.nombre}</p>
              <p className="fs-sub" style={{ fontSize: '0.75rem' }}>
                {roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}
              </p>
            </div>
            <span className="fs-avatar">{iniciales(usuario?.nombre ?? '')}</span>
            <button type="button" className="fs-btn fs-btn--contorno fs-btn--s" onClick={salir}>
              Salir
            </button>
          </div>
        </header>

        <main className="fs-panel-main">
          <Outlet />
        </main>
      </div>

      {abierto && <div className="fs-sidebar__fondo" onClick={() => setAbierto(false)} />}
    </div>
  );
}
