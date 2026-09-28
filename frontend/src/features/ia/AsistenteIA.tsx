import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';
import { ImagenProducto } from '../../components/ui/ImagenProducto';
import { etiquetaOrigen } from '../../api/ia.contratos';
import { usePreguntarIA } from '../../hooks/useOperaciones';
import { moneda } from '../../lib/format';
import { precioActual } from '../../lib/domain';
import type { MensajeChat } from '../../types/ia';

const SUGERENCIAS = [
  'Que me recomiendas para la oficina?',
  'Busco algo para una fiesta de noche',
  'Que prendas estan en promocion?',
];

const BIENVENIDA: MensajeChat = {
  id: 'bienvenida',
  rol: 'asistente',
  texto:
    'Hola, soy tu asistente de estilo. Contame que ocasion tenes en mente, tu presupuesto o el tipo de prenda y te sugiero opciones con stock disponible.',
  fecha: new Date().toISOString(),
};

export function AsistenteIA({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([BIENVENIDA]);
  const [texto, setTexto] = useState('');
  const preguntar = usePreguntarIA();
  const finRef = useRef<HTMLDivElement>(null);

  async function enviar(e: FormEvent | null, mensajeDirecto?: string) {
    e?.preventDefault();
    const contenido = (mensajeDirecto ?? texto).trim();
    if (!contenido || preguntar.isPending) return;

    const propio: MensajeChat = {
      id: `u-${Date.now()}`,
      rol: 'usuario',
      texto: contenido,
      fecha: new Date().toISOString(),
    };
    setMensajes((m) => [...m, propio]);
    setTexto('');

    try {
      const respuesta = await preguntar.mutateAsync({
        mensaje: contenido,
        historial: mensajes.filter((m) => m.id !== BIENVENIDA.id && !m.id.startsWith('e-')),
      });
      setMensajes((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          rol: 'asistente',
          texto: respuesta.respuesta,
          productos: respuesta.productos_sugeridos,
          origen: respuesta.origen,
          fecha: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setMensajes((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          rol: 'asistente',
          texto:
            error instanceof Error
              ? error.message
              : 'No pude responder en este momento. Intenta nuevamente en unos segundos.',
          fecha: new Date().toISOString(),
        },
      ]);
    } finally {
      requestAnimationFrame(() => finRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  return (
    <Modal abierto={abierto} titulo="Asistente de estilo" onCerrar={onCerrar} ancho>
      <div className="fs-pila">
        <div className="fs-chat">
          {mensajes.map((m) => (
            <div key={m.id} className="fs-pila" style={{ gap: 8 }}>
              <div className={`fs-chat__burbuja fs-chat__burbuja--${m.rol}`}>{m.texto}</div>
              {m.origen && (
                <span className="fs-sub" style={{ fontSize: '0.72rem' }}>
                  Respuesta: {etiquetaOrigen(m.origen)}
                </span>
              )}

              {m.productos && m.productos.length > 0 && (
                <div className="fs-chat__sugeridos">
                  {m.productos.map((p) => (
                    <Link
                      key={p.id_producto}
                      to={`/producto/${p.id_producto}`}
                      onClick={onCerrar}
                      className="fs-pila"
                      style={{ gap: 6 }}
                    >
                      <div className="fs-producto__figura" style={{ aspectRatio: '3 / 4' }}>
                        <ImagenProducto src={p.imagen_url} alt={p.nombre} />
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{p.nombre}</span>
                      <span className="fs-sub">{moneda(precioActual(p))}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {preguntar.isPending && (
            <div className="fs-chat__burbuja fs-chat__burbuja--asistente fs-sub">Escribiendo...</div>
          )}
          <div ref={finRef} />
        </div>

        <div className="fs-fila-wrap">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              className="fs-chip"
              onClick={() => enviar(null, s)}
              disabled={preguntar.isPending}
            >
              {s}
            </button>
          ))}
        </div>

        <form className="fs-fila" onSubmit={enviar}>
          <input
            className="fs-input"
            placeholder="Escribe tu consulta..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="fs-btn fs-btn--acento" disabled={preguntar.isPending || !texto.trim()}>
            Enviar
          </button>
        </form>

        <p className="fs-campo-ayuda">
          Las respuestas se generan en el backend. Verifica disponibilidad y tallas antes de comprar.
        </p>
      </div>
    </Modal>
  );
}
