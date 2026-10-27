import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { esSlugValido, fijarEmpresa, obtenerEmpresa } from '../../api/empresa';
import { Cargando } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { empresaService } from '../../services/empresa.service';
import { ErrorApi } from '../../types/api';

/**
 * `/t/:slug/...` fija la tienda activa y continua en la ruta normal de la tienda
 * (`/t/empresa-b/catalogo` -> `/catalogo`). Los enlaces internos no cambian y el
 * backend recibe la empresa por el header X-Tenant.
 */
export default function EntradaEmpresa() {
  const { slug = '' } = useParams();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const { autenticado, cerrarSesion } = useAuth();
  const [error, setError] = useState('');
  const resto = ubicacion.pathname.replace(/^\/t\/[^/]+/, '') || '/';

  useEffect(() => {
    if (!esSlugValido(slug)) return;
    let activo = true;
    const anterior = obtenerEmpresa();
    (async () => {
      if (autenticado && anterior?.slug !== slug) await cerrarSesion();
      fijarEmpresa({ slug });
      try {
        const empresa = await empresaService.publica();
        if (!activo) return;
        fijarEmpresa({ slug: empresa.slug, nombre: empresa.nombre });
        navegar(resto + ubicacion.search, { replace: true });
      } catch (e) {
        if (!activo) return;
        fijarEmpresa(anterior);
        setError(e instanceof ErrorApi ? e.message : 'No pudimos abrir la tienda.');
      }
    })();
    return () => {
      activo = false;
    };
    // Solo depende del slug pedido: la sesion se revisa una vez al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!esSlugValido(slug)) return <Navigate to="/empresas" replace />;
  if (error)
    return (
      <div className="fs-estado" style={{ minHeight: '60vh' }} role="alert">
        <span className="fs-estado__icono">404</span>
        <h3>{error}</h3>
        <a href="/empresas" className="fs-btn fs-btn--contorno">
          Ver tiendas disponibles
        </a>
      </div>
    );
  return <Cargando texto="Abriendo la tienda..." />;
}
