import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCarrito } from '../hooks/useComercio';
import { iniciales } from '../lib/format';
import { RolNombre } from '../types/domain';
import { rutaInicialPorRol } from '../routes/permisos';
import { AsistenteIA } from '../features/ia/AsistenteIA';

const ENLACES = [
  { a: '/catalogo', texto: 'Catalogo' },
  { a: '/catalogo?solo_promocion=true', texto: 'Promociones' },
  { a: '/reservas/nueva', texto: 'Reservar en tienda' },
];

export function LayoutTienda() {
  const { usuario, roles, autenticado, esCliente, tieneRol, cerrarSesion } = useAuth();
  const { unidades } = useCarrito();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const navegar = useNavigate();

  const panelInterno = tieneRol(
    RolNombre.ADMINISTRADOR,
    RolNombre.ENCARGADO_SUCURSAL,
    RolNombre.CAJERO,
    RolNombre.PROVEEDOR,
  );

  async function salir() {
    await cerrarSesion();
    setMenuAbierto(false);
    navegar('/');
  }

  return (
    <div className="fs-app">
      <header className="fs-header">
        <div className="fs-contenedor fs-header__inner">
          <button
            type="button"
            className="fs-btn fs-btn--fantasma fs-header__hamburguesa"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Abrir menu"
          >
            &#9776;
          </button>

          <Link to="/" className="fs-marca">
            Fashion<span>Store</span>
          </Link>

          <nav className={`fs-header__nav${menuAbierto ? ' fs-header__nav--abierto' : ''}`}>
            {ENLACES.map((e) => (
              <NavLink
                key={e.a}
                to={e.a}
                className={({ isActive }) => `fs-header__enlace${isActive ? ' activo' : ''}`}
                onClick={() => setMenuAbierto(false)}
              >
                {e.texto}
              </NavLink>
            ))}
            {esCliente && (
              <>
                <NavLink to="/mis-reservas" className="fs-header__enlace" onClick={() => setMenuAbierto(false)}>
                  Mis reservas
                </NavLink>
                <NavLink to="/mis-compras" className="fs-header__enlace" onClick={() => setMenuAbierto(false)}>
                  Mis compras
                </NavLink>
              </>
            )}
            {panelInterno && (
              <NavLink to={rutaInicialPorRol(roles)} className="fs-header__enlace" onClick={() => setMenuAbierto(false)}>
                Panel interno
              </NavLink>
            )}
          </nav>

          <div className="fs-header__acciones">
            <button
              type="button"
              className="fs-btn fs-btn--fantasma"
              onClick={() => setAsistenteAbierto(true)}
              title="Asistente de estilo"
            >
              Asistente
            </button>

            <Link to="/carrito" className="fs-carrito-pill" aria-label="Ver carrito">
              Carrito
              {unidades > 0 && <span className="fs-carrito-pill__num">{unidades}</span>}
            </Link>

            {autenticado ? (
              <div className="fs-cuenta">
                <Link to="/mi-perfil" className="fs-avatar" title="Mi perfil" aria-label="Mi perfil">
                  {iniciales(usuario?.nombre ?? '')}
                </Link>
                <button type="button" className="fs-btn fs-btn--fantasma fs-btn--s" onClick={salir}>
                  Salir
                </button>
              </div>
            ) : (
              <Link to="/login" className="fs-btn fs-btn--contorno fs-btn--s">
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="fs-main">
        <Outlet />
      </main>

      <footer className="fs-footer">
        <div className="fs-contenedor fs-footer__inner">
          <div>
            <p className="fs-marca fs-marca--footer">
              Fashion<span>Store</span>
            </p>
            <p className="fs-sub">Moda femenina con presencia nacional. Compra online o reserva para probar en tienda.</p>
          </div>
          <div>
            <p className="fs-eyebrow">Tienda</p>
            <Link to="/catalogo" className="fs-footer__enlace">Catalogo</Link>
            <Link to="/catalogo?solo_promocion=true" className="fs-footer__enlace">Promociones</Link>
            <Link to="/reservas/nueva" className="fs-footer__enlace">Reservar prendas</Link>
          </div>
          <div>
            <p className="fs-eyebrow">Cuenta</p>
            <Link to="/mi-perfil" className="fs-footer__enlace">Mi perfil</Link>
            <Link to="/mis-compras" className="fs-footer__enlace">Mis compras</Link>
            <Link to="/mis-reservas" className="fs-footer__enlace">Mis reservas</Link>
            <Link to="/login" className="fs-footer__enlace">Iniciar sesion</Link>
          </div>
        </div>
        <div className="fs-contenedor fs-footer__legal">
          <span className="fs-sub">FashionStore MVP - Sistemas de Informacion II</span>
        </div>
      </footer>

      <AsistenteIA abierto={asistenteAbierto} onCerrar={() => setAsistenteAbierto(false)} />
    </div>
  );
}
