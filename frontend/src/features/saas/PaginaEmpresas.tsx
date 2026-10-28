import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fijarEmpresa, obtenerEmpresa } from '../../api/empresa';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { claves } from '../../hooks/claves';
import { empresaService } from '../../services/empresa.service';

/** Selector de tiendas (empresas) de la plataforma. */
export default function PaginaEmpresas() {
  const navegar = useNavigate();
  const { autenticado, cerrarSesion } = useAuth();
  const activa = obtenerEmpresa();
  const directorio = useQuery({ queryKey: claves.directorioEmpresas, queryFn: empresaService.directorio });

  async function elegir(slug: string, nombre: string) {
    // Una sesion pertenece a una sola empresa: cambiar de tienda la cierra.
    if (autenticado && activa?.slug !== slug) await cerrarSesion();
    fijarEmpresa({ slug, nombre });
    navegar(`/t/${slug}`);
  }

  return (
    <div className="fs-contenedor" style={{ paddingBlock: 32 }}>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">FashionStore SaaS</p>
          <h1>Elige una tienda</h1>
          <p className="fs-sub">Cada empresa tiene su propio catalogo, sucursales y cuentas.</p>
        </div>
      </header>
      {directorio.isPending && <FilasSkeleton filas={3} />}
      {directorio.isError && <ErrorEstado error={directorio.error} onReintentar={() => directorio.refetch()} />}
      {directorio.data?.length === 0 && <Vacio titulo="Sin tiendas" mensaje="Todavia no hay empresas activas." />}
      <div className="fs-pila">
        {directorio.data?.map((empresa) => (
          <button
            key={empresa.slug}
            type="button"
            className="fs-tarjeta fs-tarjeta--pad fs-fila"
            style={{ justifyContent: 'space-between', textAlign: 'left' }}
            onClick={() => void elegir(empresa.slug, empresa.nombre)}
          >
            <span>
              <strong>{empresa.nombre}</strong>
              <span className="fs-sub" style={{ display: 'block' }}>/t/{empresa.slug}</span>
            </span>
            {activa?.slug === empresa.slug && <span className="fs-badge fs-badge--acento">Tienda actual</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
