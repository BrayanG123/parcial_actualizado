import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorEstado, FilasSkeleton } from '../../components/ui/Estados';
import { FUNCIONALIDADES_PLAN, saasService, type PlanPublico } from '../../services/saas.service';
import '../../styles/landing.css';

/**
 * Landing de la plataforma SaaS (ruta `/`). Presenta el servicio a tiendas de ropa;
 * no muestra el catalogo de ninguna empresa: cada tienda vive en `/t/:codigo`.
 */
const FUNCIONES = [
  ['Catalogo con variantes', 'Productos con tallas, colores, temporadas, colecciones, fotos y precios mayoristas.'],
  ['Inventario multisucursal', 'Stock fisico y reservado por sucursal, kardex, entradas programadas y alertas de stock bajo.'],
  ['Punto de venta y caja', 'Ventas en tienda con turnos, arqueo, comprobantes, cambios de prendas y notas de credito.'],
  ['Funciona sin internet', 'Ventas y reservas offline en la web instalable y en la app movil, con sincronizacion segura.'],
  ['Tienda online y app movil', 'Cada empresa tiene su tienda propia: carrito, pago con tarjeta, contra entrega y reservas.'],
  ['Reportes con IA', 'Pide reportes en lenguaje natural o por voz y obten tablas, graficos y exportacion a Excel o PDF.'],
  ['Analitica inteligente', 'Prediccion de demanda, segmentos de clientes y deteccion de semanas atipicas.'],
  ['Probador virtual', 'Realidad aumentada para que tus clientes se prueben las prendas desde la camara.'],
  ['Datos aislados por empresa', 'Cada empresa trabaja en su propio entorno: nadie mas ve tus clientes, ventas ni stock.'],
] as const;

const PASOS = [
  ['Elige tu plan', 'Empieza gratis y cambia de plan cuando tu negocio crezca.'],
  ['Registra tu empresa', 'Nombre, codigo de tu tienda y la cuenta del administrador. Listo en un minuto.'],
  ['Configura y vende', 'Crea tus sucursales, carga tus prendas e invita a tu equipo.'],
] as const;

function precio(plan: PlanPublico) {
  return plan.precio_mensual === 0 ? 'Gratis' : `$${plan.precio_mensual.toFixed(0)}`;
}

export default function PaginaLanding() {
  const planes = useQuery({ queryKey: ['saas', 'planes'], queryFn: saasService.planes });
  const destacado = planes.data?.reduce<PlanPublico | undefined>(
    (mejor, p) => (!mejor || p.precio_mensual > mejor.precio_mensual ? p : mejor),
    undefined,
  )?.codigo;

  return (
    <div className="fs-landing">
      <header className="fs-landing__barra">
        <div className="fs-contenedor fs-landing__barra-inner">
          <Link to="/" className="fs-marca">
            Fashion<span>Store</span>
            <small className="fs-landing__etiqueta">SaaS</small>
          </Link>
          <nav className="fs-landing__nav" aria-label="Secciones">
            <a href="#funciones">Funciones</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#planes">Planes</a>
          </nav>
          <div className="fs-landing__acciones">
            <Link to="/login" className="fs-btn fs-btn--contorno">
              Iniciar sesion
            </Link>
            <Link to="/registro-empresa" className="fs-btn fs-btn--acento">
              Registrar empresa
            </Link>
          </div>
        </div>
      </header>

      <section className="fs-hero">
        <div className="fs-contenedor fs-hero__inner">
          <div>
            <p className="fs-eyebrow" style={{ color: 'var(--fs-oro)' }}>
              Software para tiendas de ropa
            </p>
            <h1>Gestiona tu cadena de tiendas de ropa desde una sola plataforma</h1>
            <p>
              Catalogo, inventario por sucursal, caja, tienda online, app movil, reservas y reportes
              con inteligencia artificial. Sin instalar servidores: contratas tu plan y empiezas a vender.
            </p>
            <div className="fs-hero__acciones">
              <Link to="/registro-empresa" className="fs-btn fs-btn--acento">
                Empieza ahora
              </Link>
              <a href="#planes" className="fs-btn fs-btn--contorno">
                Ver planes
              </a>
            </div>
          </div>
          <div className="fs-hero__panel">
            <div className="fs-hero__dato">
              <strong>Multisucursal</strong>
              <span>Stock y caja por sucursal</span>
            </div>
            <div className="fs-hero__dato">
              <strong>Offline</strong>
              <span>Vende aunque se caiga el internet</span>
            </div>
            <div className="fs-hero__dato">
              <strong>IA</strong>
              <span>Reportes en lenguaje natural</span>
            </div>
          </div>
        </div>
      </section>

      <section id="funciones" className="fs-seccion">
        <div className="fs-contenedor">
          <div className="fs-landing__titulo">
            <p className="fs-eyebrow">Todo en un solo lugar</p>
            <h2>Lo que tu tienda necesita para operar</h2>
          </div>
          <div className="fs-landing__rejilla">
            {FUNCIONES.map(([titulo, texto]) => (
              <article key={titulo} className="fs-tarjeta fs-tarjeta--pad fs-landing__funcion">
                <h3>{titulo}</h3>
                <p className="fs-sub">{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="fs-seccion fs-landing__franja">
        <div className="fs-contenedor">
          <div className="fs-landing__titulo">
            <p className="fs-eyebrow">Como funciona</p>
            <h2>Tu tienda lista en tres pasos</h2>
          </div>
          <ol className="fs-landing__pasos">
            {PASOS.map(([titulo, texto], i) => (
              <li key={titulo}>
                <span className="fs-landing__numero">{i + 1}</span>
                <h3>{titulo}</h3>
                <p className="fs-sub">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="planes" className="fs-seccion">
        <div className="fs-contenedor">
          <div className="fs-landing__titulo">
            <p className="fs-eyebrow">Planes</p>
            <h2>Elige el plan para tu negocio</h2>
            <p className="fs-sub">Precios mensuales en dolares. Puedes cambiar de plan en cualquier momento.</p>
          </div>
          {planes.isPending && <FilasSkeleton filas={3} />}
          {planes.isError && <ErrorEstado error={planes.error} onReintentar={() => planes.refetch()} />}
          {planes.data && (
            <div className="fs-landing__planes">
              {planes.data.map((plan) => (
                <article
                  key={plan.codigo}
                  className={`fs-tarjeta fs-landing__plan${plan.codigo === destacado ? ' fs-landing__plan--destacado' : ''}`}
                >
                  {plan.codigo === destacado && <span className="fs-badge fs-badge--acento">Recomendado</span>}
                  <h3>{plan.nombre}</h3>
                  <p className="fs-landing__precio">
                    {precio(plan)}
                    {plan.precio_mensual > 0 && <small> USD / mes</small>}
                  </p>
                  <p className="fs-sub">{plan.descripcion}</p>
                  <ul className="fs-landing__lista">
                    <li className="fs-landing__si">
                      Hasta {plan.max_sucursales} {plan.max_sucursales === 1 ? 'sucursal activa' : 'sucursales activas'}
                    </li>
                    {FUNCIONALIDADES_PLAN.map(([clave, texto]) => (
                      <li key={clave} className={plan.funcionalidades[clave] ? 'fs-landing__si' : 'fs-landing__no'}>
                        {texto}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/registro-empresa?plan=${encodeURIComponent(plan.codigo)}`}
                    className={`fs-btn fs-btn--bloque ${plan.codigo === destacado ? 'fs-btn--acento' : 'fs-btn--contorno'}`}
                  >
                    Elegir {plan.nombre}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="fs-landing__pie">
        <div className="fs-contenedor fs-landing__pie-inner">
          <div>
            <p className="fs-marca">
              Fashion<span>Store</span>
            </p>
            <p className="fs-sub">Plataforma SaaS para cadenas de tiendas de ropa.</p>
          </div>
          <nav className="fs-landing__pie-enlaces" aria-label="Enlaces">
            <Link to="/login">Acceso de empresas</Link>
            <Link to="/empresas">Directorio de tiendas</Link>
            <Link to="/plataforma/login">Administracion de la plataforma</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
