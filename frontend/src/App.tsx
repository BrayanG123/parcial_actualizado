import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from './components/ui/Estados';
import { useAuth } from './context/AuthContext';
import { LayoutTienda } from './layouts/LayoutTienda';
import { LayoutPanel } from './layouts/LayoutPanel';
import { RutaProtegida } from './routes/RutaProtegida';
import { ROLES_AREA, rutaInicialPorRol } from './routes/permisos';

/* Tienda */
const PaginaInicio = lazy(() => import('./features/catalog/PaginaInicio'));
const PaginaCatalogo = lazy(() => import('./features/catalog/PaginaCatalogo'));
const PaginaProducto = lazy(() => import('./features/catalog/PaginaProducto'));
const PaginaCarrito = lazy(() => import('./features/cart/PaginaCarrito'));
const PaginaCheckout = lazy(() => import('./features/checkout/PaginaCheckout'));
const PaginaNuevaReserva = lazy(() => import('./features/reservations/PaginaNuevaReserva'));
const PaginaMisReservas = lazy(() => import('./features/reservations/PaginaMisReservas'));
const PaginaMisCompras = lazy(() => import('./features/sales/PaginaMisCompras'));
const PaginaDetalleCompra = lazy(() => import('./features/sales/PaginaDetalleCompra'));

/* Autenticacion */
const PaginaLogin = lazy(() => import('./features/auth/PaginaLogin'));
const PaginaRegistro = lazy(() => import('./features/auth/PaginaRegistro'));
const PaginaPerfil = lazy(() => import('./features/auth/PaginaPerfil'));

/* Administracion */
const PaginaDashboard = lazy(() => import('./features/admin/PaginaDashboard'));
const PaginaProductosAdmin = lazy(() => import('./features/admin/PaginaProductos'));
const PaginaCategorias = lazy(() => import('./features/admin/PaginaCategorias'));
const PaginaTallas = lazy(() => import('./features/admin/PaginaTallas'));
const PaginaColores = lazy(() => import('./features/admin/PaginaColores'));
const PaginaTemporadas = lazy(() => import('./features/admin/PaginaTemporadas'));
const PaginaColecciones = lazy(() => import('./features/admin/PaginaColecciones'));
const PaginaSucursales = lazy(() => import('./features/admin/PaginaSucursales'));
const PaginaProveedores = lazy(() => import('./features/admin/PaginaProveedores'));
const PaginaUsuarios = lazy(() => import('./features/admin/PaginaUsuarios'));
const PaginaRoles = lazy(() => import('./features/admin/PaginaRoles'));
const PaginaInventarioAdmin = lazy(() => import('./features/inventory/PaginaInventario'));
const PaginaReservasOperacion = lazy(() => import('./features/reservations/PaginaReservasOperacion'));
const PaginaVentasOperacion = lazy(() => import('./features/sales/PaginaVentasOperacion'));
const PaginaMovimientos = lazy(() => import('./features/inventory/PaginaMovimientos'));
const PaginaReportes = lazy(() => import('./features/reports/PaginaReportes'));
const PaginaReporteIA = lazy(() => import('./features/reports/PaginaReporteIA'));

/* Caja y proveedor */
const PaginaOffline = lazy(() => import('./features/pos/PaginaOffline'));
const PaginaTurnos = lazy(() => import('./features/pos/PaginaTurnos'));
const PaginaPuntoVenta = lazy(() => import('./features/pos/PaginaPuntoVenta'));
const PaginaProductosProveedor = lazy(() => import('./features/supplier/PaginaProductosProveedor'));
const PaginaEntregasProveedor = lazy(() => import('./features/supplier/PaginaEntregas'));

function SinPermisos() {
  const { roles } = useAuth();
  return (
    <div className="fs-estado" style={{ minHeight: '60vh' }}>
      <span className="fs-estado__icono">&#128274;</span>
      <h3>No tienes acceso a esta seccion</h3>
      <p className="fs-sub">Si crees que es un error, consulta con el administrador del sistema.</p>
      <Link to={rutaInicialPorRol(roles)} className="fs-btn fs-btn--contorno">
        Ir a mi inicio
      </Link>
    </div>
  );
}

function NoEncontrada() {
  return (
    <div className="fs-estado" style={{ minHeight: '60vh' }}>
      <span className="fs-estado__icono">404</span>
      <h3>Pagina no encontrada</h3>
      <p className="fs-sub">La direccion que intentas abrir no existe.</p>
      <Link to="/" className="fs-btn fs-btn--contorno">Ir al inicio</Link>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        {/* --- tienda --- */}
        <Route element={<LayoutTienda />}>
          <Route index element={<PaginaInicio />} />
          <Route path="catalogo" element={<PaginaCatalogo />} />
          <Route path="producto/:id" element={<PaginaProducto />} />
          <Route path="reservas/nueva" element={
            <RutaProtegida roles={[...ROLES_AREA.cliente]}>
              <PaginaNuevaReserva />
            </RutaProtegida>
          } />
          <Route
            path="carrito"
            element={
              <RutaProtegida roles={[...ROLES_AREA.cliente]}>
                <PaginaCarrito />
              </RutaProtegida>
            }
          />
          <Route
            path="checkout"
            element={
              <RutaProtegida roles={[...ROLES_AREA.cliente]}>
                <PaginaCheckout />
              </RutaProtegida>
            }
          />
          <Route
            path="mis-reservas"
            element={
              <RutaProtegida roles={[...ROLES_AREA.cliente]}>
                <PaginaMisReservas />
              </RutaProtegida>
            }
          />
          <Route
            path="mis-compras"
            element={
              <RutaProtegida roles={[...ROLES_AREA.cliente]}>
                <PaginaMisCompras />
              </RutaProtegida>
            }
          />
          <Route
            path="mis-compras/:id"
            element={
              <RutaProtegida roles={[...ROLES_AREA.cliente]}>
                <PaginaDetalleCompra />
              </RutaProtegida>
            }
          />
          <Route
            path="mi-perfil"
            element={
              <RutaProtegida>
                <PaginaPerfil />
              </RutaProtegida>
            }
          />
          <Route path="sin-permisos" element={<SinPermisos />} />
          <Route path="*" element={<NoEncontrada />} />
        </Route>

        {/* --- autenticacion --- */}
        <Route path="/login" element={<PaginaLogin />} />
        <Route path="/registro" element={<PaginaRegistro />} />

        {/* --- administracion --- */}
        <Route
          path="/admin"
          element={
            <RutaProtegida roles={[...ROLES_AREA.admin]}>
              <LayoutPanel />
            </RutaProtegida>
          }
        >
          <Route index element={<PaginaDashboard />} />
          <Route path="productos" element={<PaginaProductosAdmin />} />
          <Route path="categorias" element={<PaginaCategorias />} />
          <Route path="tallas" element={<PaginaTallas />} />
          <Route path="colores" element={<PaginaColores />} />
          <Route path="temporadas" element={<PaginaTemporadas />} />
          <Route path="colecciones" element={<PaginaColecciones />} />
          <Route path="sucursales" element={<PaginaSucursales />} />
          <Route path="proveedores" element={<PaginaProveedores />} />
          <Route path="usuarios" element={<PaginaUsuarios />} />
          <Route path="roles" element={<PaginaRoles />} />
          <Route path="inventario" element={<PaginaInventarioAdmin />} />
          <Route path="movimientos" element={<PaginaMovimientos />} />
          <Route path="reservas" element={<PaginaReservasOperacion />} />
          <Route path="ventas" element={<PaginaVentasOperacion />} />
          <Route path="reportes" element={<PaginaReportes />} />
          <Route path="reportes-ia" element={<PaginaReporteIA />} />
        </Route>

        {/* --- sucursal --- */}
        <Route
          path="/sucursal"
          element={
            <RutaProtegida roles={[...ROLES_AREA.sucursal]}>
              <LayoutPanel />
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="reservas" replace />} />
          <Route path="reservas" element={<PaginaReservasOperacion />} />
          <Route path="inventario" element={<PaginaInventarioAdmin />} />
          <Route path="movimientos" element={<PaginaMovimientos />} />
          <Route path="ventas" element={<PaginaVentasOperacion />} />
          <Route path="reportes" element={<PaginaReportes />} />
          <Route path="reportes-ia" element={<PaginaReporteIA />} />
        </Route>

        {/* --- caja --- */}
        <Route
          path="/caja"
          element={
            <RutaProtegida roles={[...ROLES_AREA.caja]}>
              <LayoutPanel />
            </RutaProtegida>
          }
        >
          <Route index element={<PaginaPuntoVenta />} />
          <Route path="turnos" element={<PaginaTurnos />} />
          <Route path="offline" element={<PaginaOffline />} />
          <Route path="ventas" element={<PaginaVentasOperacion />} />
        </Route>

        {/* --- proveedor --- */}
        <Route
          path="/proveedor"
          element={
            <RutaProtegida roles={[...ROLES_AREA.proveedor]}>
              <LayoutPanel />
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="productos" replace />} />
          <Route path="productos" element={<PaginaProductosProveedor />} />
          <Route path="entregas" element={<PaginaEntregasProveedor />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
