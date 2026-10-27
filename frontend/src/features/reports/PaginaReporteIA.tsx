import { BotonesExportar } from './BotonesExportar';
import { cargarReporteIA } from './datos-exportacion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorEstado, Vacio } from '../../components/ui/Estados';
import { esRespuestaIA, etiquetaOrigen } from '../../api/ia.contratos';
import { useEstadoIA, useReporteIA } from '../../hooks/useOperaciones';
import { etiqueta, moneda } from '../../lib/format';
import type { ReporteIA } from '../../types/ia';
import { TablaInventario } from '../admin/PaginaDashboard';
import { BarraComparativa, GraficoHoras, GraficoSucursales, GraficoVentas, TarjetaKPI } from './componentes';
import { GraficoDinamico, TablaDinamica } from './GraficoDinamico';

const EJEMPLOS = [
  'Ventas web de la ultima semana',
  'Ventas por sucursal de este mes',
  'Ventas por semana de los ultimos 60 dias',
  'Top 5 prendas mas vendidas este mes',
  'Categorias con mayores ingresos del mes pasado',
  'Compara las sucursales en los ultimos 3 meses',
  'Productos con menor existencia',
  'Arqueo de cajas de ayer',
];

/* Web Speech API: Chrome y Edge la exponen con prefijo; Firefox no la soporta. */
interface ReconocimientoVoz {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((evento: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type ConstructorVoz = new () => ReconocimientoVoz;

function constructorVoz(): ConstructorVoz | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: ConstructorVoz; webkitSpeechRecognition?: ConstructorVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERRORES_VOZ: Record<string, string> = {
  'not-allowed': 'El navegador no tiene permiso para usar el microfono. Escribe tu solicitud.',
  'service-not-allowed': 'El dictado no esta permitido en este navegador. Escribe tu solicitud.',
  'no-speech': 'No se detecto voz. Intenta de nuevo o escribe tu solicitud.',
  'audio-capture': 'No se encontro un microfono disponible. Escribe tu solicitud.',
  network: 'El dictado necesita conexion a internet. Escribe tu solicitud.',
};

export default function PaginaReporteIA() {
  const [pregunta, setPregunta] = useState('');
  const [escuchando, setEscuchando] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
  const reconocimiento = useRef<ReconocimientoVoz | null>(null);
  const estado = useEstadoIA();
  const reporte = useReporteIA();
  const Voz = constructorVoz();

  useEffect(() => () => reconocimiento.current?.stop(), []);

  function generar(e: FormEvent | null, texto = pregunta) {
    e?.preventDefault();
    const limpio = texto.trim();
    if (limpio.length < 3 || reporte.isPending) return;
    setPregunta(limpio);
    reporte.mutate(limpio);
  }

  function dictar() {
    if (!Voz) return;
    if (escuchando) {
      reconocimiento.current?.stop();
      return;
    }
    const r = new Voz();
    r.lang = 'es-BO';
    r.interimResults = true;
    r.continuous = false;
    let final = '';
    r.onresult = (evento) => {
      final = Array.from(evento.results)
        .map((resultado) => resultado[0]?.transcript ?? '')
        .join(' ')
        .trim();
      setPregunta(final);
    };
    r.onerror = (evento) => setAvisoVoz(ERRORES_VOZ[evento.error] ?? 'No se pudo usar el dictado. Escribe tu solicitud.');
    r.onend = () => {
      setEscuchando(false);
      if (final.length >= 3) generar(null, final);
    };
    reconocimiento.current = r;
    setAvisoVoz(null);
    setEscuchando(true);
    r.start();
  }

  const proveedor = estado.data;
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Inteligencia artificial</p>
          <h1>Reportes por voz o texto</h1>
          <p className="fs-sub">
            Pide un reporte en lenguaje natural. La IA solo elige entre reportes y filtros permitidos; los datos
            los calcula el servidor con tus permisos.
          </p>
        </div>
      </header>

      {proveedor && (
        <div className={`fs-alerta ${proveedor.configurado ? 'fs-alerta--info' : ''}`}>
          <span>
            {proveedor.configurado
              ? `Proveedor activo: ${proveedor.proveedor === 'ollama' ? 'IA local (Ollama)' : 'Gemini'} - ${proveedor.modelo}.`
              : 'No hay un proveedor de IA configurado en el servidor: las solicitudes se interpretan con reglas basicas.'}
          </span>
        </div>
      )}

      <section className="fs-tarjeta fs-tarjeta--pad">
        <form className="fs-pila" onSubmit={generar}>
          <label htmlFor="pregunta-reporte" className="fs-eyebrow">
            Solicitud
          </label>
          <div className="fs-fila-wrap">
            <input
              id="pregunta-reporte"
              className="fs-input"
              style={{ flex: '1 1 320px' }}
              maxLength={300}
              placeholder="Ej.: ventas presenciales de este mes en La Paz"
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
            />
            {Voz && (
              <button
                type="button"
                className={`fs-btn ${escuchando ? 'fs-btn--acento' : 'fs-btn--contorno'}`}
                onClick={dictar}
                aria-pressed={escuchando}
              >
                {escuchando ? 'Detener dictado' : 'Dictar'}
              </button>
            )}
            <button
              type="submit"
              className="fs-btn fs-btn--acento"
              disabled={reporte.isPending || pregunta.trim().length < 3}
            >
              {reporte.isPending ? 'Generando...' : 'Generar reporte'}
            </button>
          </div>
          {escuchando && <p className="fs-sub">Escuchando... habla con claridad y en espanol.</p>}
          {avisoVoz && <p className="fs-campo-error">{avisoVoz}</p>}
          {!Voz && (
            <p className="fs-campo-ayuda">
              Este navegador no permite dictado; escribe tu solicitud. Chrome y Edge admiten comando de voz.
            </p>
          )}
          <div className="fs-fila-wrap">
            {EJEMPLOS.map((ejemplo) => (
              <button
                key={ejemplo}
                type="button"
                className="fs-chip"
                disabled={reporte.isPending}
                onClick={() => generar(null, ejemplo)}
              >
                {ejemplo}
              </button>
            ))}
          </div>
        </form>
      </section>

      {reporte.isError && <ErrorEstado error={reporte.error} onReintentar={() => generar(null)} />}
      {reporte.data && (reporte.data.tipo === 'aclaracion' || reporte.data.tipo === 'no_soportado') && (
        <SinReporte reporte={reporte.data} ocupado={reporte.isPending} onElegir={(q) => generar(null, q)} />
      )}
      {reporte.data && reporte.data.tipo !== 'aclaracion' && reporte.data.tipo !== 'no_soportado' && (
        <>
          <BotonesExportar
            cargar={() => cargarReporteIA(reporte.data!)}
            deshabilitado={reporte.isPending || reporte.isError}
          />
          <ResultadoReporteIA reporte={reporte.data} />
        </>
      )}
      {!reporte.data && !reporte.isError && !reporte.isPending && (
        <Vacio titulo="Sin reporte" mensaje="Escribe o dicta una solicitud para generar un reporte." />
      )}
    </>
  );
}

/** Solicitud ambigua o fuera del catalogo: explica y ofrece reportes posibles. */
function SinReporte({
  reporte,
  ocupado,
  onElegir,
}: {
  reporte: Extract<ReporteIA, { tipo: 'aclaracion' | 'no_soportado' }>;
  ocupado: boolean;
  onElegir: (pregunta: string) => void;
}) {
  return (
    <section className="fs-panel" role="status">
      <div className="fs-fila-entre fs-fila-wrap">
        <h3>{reporte.tipo === 'aclaracion' ? 'Necesito una aclaracion' : 'Solicitud no disponible'}</h3>
        <span className="fs-badge">{etiquetaOrigen(reporte.origen)}</span>
      </div>
      <div className={`fs-alerta ${reporte.tipo === 'aclaracion' ? 'fs-alerta--info' : ''}`}>
        <span>{reporte.resumen}</span>
      </div>
      {reporte.sugerencias.length > 0 && (
        <>
          <p className="fs-sub" style={{ marginTop: 12 }}>
            Puedes pedir, por ejemplo:
          </p>
          <div className="fs-fila-wrap">
            {reporte.sugerencias.map((s) => (
              <button key={s} type="button" className="fs-chip" disabled={ocupado} onClick={() => onElegir(s)}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ResultadoReporteIA({ reporte }: { reporte: ReporteIA }) {
  const i = reporte.interpretacion;
  const filtros = [
    i.desde || i.hasta ? `Periodo: ${i.desde ?? 'inicio'} a ${i.hasta ?? 'hoy'}` : null,
    i.sucursales && i.sucursales.length > 1
      ? `Sucursales: ${i.sucursales.join(', ')}`
      : `Sucursal: ${i.sucursal ?? 'todas las autorizadas'}`,
    i.categorias?.length ? `Categorias: ${i.categorias.join(', ')}` : null,
    i.productos?.length ? `Productos: ${i.productos.join(', ')}` : null,
    i.meses ? `Meses: ${i.meses}` : null,
    i.canal ? `Canal: ${etiqueta(i.canal)}` : null,
    i.limite ? `Limite: ${i.limite}` : null,
    i.solo_stock_bajo ? 'Solo stock bajo' : null,
  ].filter(Boolean);

  return (
    <>
      <section className="fs-panel">
        <div className="fs-fila-entre fs-fila-wrap">
          <h3>Interpretacion</h3>
          <span className={`fs-badge ${esRespuestaIA(reporte.origen) ? 'fs-badge--info' : ''}`}>
            {etiquetaOrigen(reporte.origen)}
          </span>
        </div>
        <p>{i.explicacion}</p>
        <div className="fs-fila-wrap">
          {filtros.map((f) => (
            <span key={f} className="fs-chip">
              {f}
            </span>
          ))}
        </div>
        <div className="fs-alerta fs-alerta--info" style={{ marginTop: 12 }}>
          <span>{reporte.resumen}</span>
        </div>
      </section>

      {reporte.tipo === 'catalogo' && (
        <section className="fs-panel">
          <h3>{reporte.grafico.titulo}</h3>
          {reporte.tabla.filas.length === 0 ? (
            <Vacio titulo="Sin datos" mensaje="No hay datos con esos filtros." />
          ) : (
            <div className="fs-pila">
              <GraficoDinamico grafico={reporte.grafico} tabla={reporte.tabla} />
              <TablaDinamica tabla={reporte.tabla} />
            </div>
          )}
        </section>
      )}

      {reporte.tipo === 'ventas' && (
        <>
          <section className="fs-kpis">
            <TarjetaKPI etiqueta="Monto vendido" valor={moneda(reporte.ventas.resumen.monto_total, reporte.ventas.moneda)} />
            <TarjetaKPI etiqueta="Ventas" valor={String(reporte.ventas.resumen.cantidad_ventas)} />
            <TarjetaKPI etiqueta="Ticket promedio" valor={moneda(reporte.ventas.resumen.ticket_promedio, reporte.ventas.moneda)} />
            <TarjetaKPI etiqueta="Unidades" valor={String(reporte.ventas.resumen.unidades_vendidas)} />
          </section>
          {reporte.ventas.resumen.cantidad_ventas > 0 ? (
            <section className="fs-rejilla-2">
              <article className="fs-panel">
                <h3>Ventas diarias</h3>
                <GraficoVentas datos={reporte.ventas.diario} />
              </article>
              <article className="fs-panel">
                <h3>Por sucursal</h3>
                <GraficoSucursales datos={reporte.ventas.por_sucursal} />
              </article>
              <article className="fs-panel">
                <h3>Por hora</h3>
                <GraficoHoras datos={reporte.ventas.por_hora} />
              </article>
            </section>
          ) : (
            <Vacio titulo="Sin ventas" mensaje="No hubo ventas completadas con esos filtros." />
          )}
        </>
      )}

      {reporte.tipo === 'top' && (
        <section className="fs-panel">
          <h3>Ranking de prendas</h3>
          {reporte.top.length === 0 ? (
            <Vacio titulo="Sin datos" mensaje="No hubo prendas vendidas con esos filtros." />
          ) : (
            <div className="fs-pila">
              {reporte.top.map((t) => (
                <BarraComparativa
                  key={t.id_producto}
                  etiqueta={`${t.posicion}. ${t.nombre}`}
                  valor={t.unidades}
                  maximo={Math.max(1, ...reporte.top.map((x) => x.unidades))}
                  detalle={`${t.unidades} u - ${moneda(t.total)}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {reporte.tipo === 'inventario' && (
        <section className="fs-panel">
          <h3>Inventario</h3>
          <p className="fs-sub">
            {reporte.inventario.resumen.variantes} variantes - {reporte.inventario.resumen.stock_bajo} con stock bajo,{' '}
            {reporte.inventario.resumen.agotados} agotadas. Se muestran {reporte.inventario.items.length} de{' '}
            {reporte.inventario.total}.
          </p>
          {reporte.inventario.items.length > 0 && <TablaInventario filas={reporte.inventario.items} />}
        </section>
      )}

      {reporte.tipo === 'caja' && (
        <section className="fs-panel">
          <h3>Cajas y turnos</h3>
          <section className="fs-kpis">
            <TarjetaKPI
              etiqueta="Turnos"
              valor={String(reporte.caja.resumen.turnos)}
              detalle={`${reporte.caja.resumen.turnos_abiertos} abiertos`}
            />
            <TarjetaKPI etiqueta="Cobrado" valor={moneda(reporte.caja.resumen.total, reporte.caja.moneda)} />
            <TarjetaKPI etiqueta="Efectivo" valor={moneda(reporte.caja.resumen.efectivo, reporte.caja.moneda)} />
            <TarjetaKPI etiqueta="Diferencia" valor={moneda(reporte.caja.resumen.diferencia, reporte.caja.moneda)} />
          </section>
          {reporte.caja.por_caja.length > 0 && (
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Sucursal</th>
                    <th className="fs-tabla-num">Turnos</th>
                    <th className="fs-tabla-num">Total</th>
                    <th className="fs-tabla-num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.caja.por_caja.map((c) => (
                    <tr key={c.id_caja}>
                      <td>{c.caja}</td>
                      <td>{c.sucursal}</td>
                      <td className="fs-tabla-num">{c.turnos}</td>
                      <td className="fs-tabla-num">{moneda(c.total, reporte.caja.moneda)}</td>
                      <td className="fs-tabla-num">{moneda(c.diferencia, reporte.caja.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {reporte.tipo === 'reservas' && (
        <section className="fs-panel">
          <h3>Reservas por estado</h3>
          <div className="fs-pila" style={{ gap: 8 }}>
            {reporte.reservas.map((r) => (
              <div key={r.estado} className="fs-fila-entre">
                <span>{etiqueta(r.estado)}</span>
                <span className="fs-nums">{r.cantidad}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
