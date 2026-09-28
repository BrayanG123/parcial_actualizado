import { useState } from 'react';
import { ImagenProducto } from '../../components/ui/ImagenProducto';

export function GaleriaProducto({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const actual = seleccionada && fotos.includes(seleccionada) ? seleccionada : (fotos[0] ?? '');
  return (
    <div className="fs-pila">
      <div className="fs-detalle__imagen">
        <ImagenProducto src={actual} alt={nombre} prioritaria />
      </div>
      {fotos.length > 1 && (
        <div className="fs-fila-wrap" aria-label="Galeria de fotos">
          {fotos.map((foto, i) => (
            <button
              type="button"
              key={foto}
              className="fs-chip"
              style={{ width: 74, height: 88, padding: 3, overflow: 'hidden' }}
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={actual === foto}
              onClick={() => setSeleccionada(foto)}
            >
              <ImagenProducto src={foto} alt={`${nombre}, foto ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
