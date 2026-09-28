/** Estados transversales: cargando, vacio y error. Ninguna vista queda en blanco. */
import type { ReactNode } from 'react';

export function Cargando({ texto = 'Cargando informacion...' }: { texto?: string }) {
  return (
    <div className="fs-estado" role="status" aria-live="polite">
      <div className="fs-skeleton" style={{ width: 120, height: 12 }} />
      <div className="fs-skeleton" style={{ width: 220, height: 12 }} />
      <p className="fs-sub">{texto}</p>
    </div>
  );
}

export function RejillaSkeleton({ cantidad = 8 }: { cantidad?: number }) {
  return (
    <div className="fs-rejilla-productos">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="fs-pila" style={{ gap: 10 }}>
          <div className="fs-skeleton" style={{ aspectRatio: '3 / 4', width: '100%' }} />
          <div className="fs-skeleton" style={{ height: 12, width: '70%' }} />
          <div className="fs-skeleton" style={{ height: 12, width: '40%' }} />
        </div>
      ))}
    </div>
  );
}

export function FilasSkeleton({ filas = 5 }: { filas?: number }) {
  return (
    <div className="fs-pila" style={{ gap: 10 }}>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="fs-skeleton" style={{ height: 44 }} />
      ))}
    </div>
  );
}

export function Vacio({
  titulo = 'Sin resultados',
  mensaje = 'No encontramos informacion para mostrar aqui.',
  icono = '○',
  accion,
}: {
  titulo?: string;
  mensaje?: string;
  icono?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="fs-estado">
      <span className="fs-estado__icono" aria-hidden="true">{icono}</span>
      <h3>{titulo}</h3>
      <p className="fs-sub" style={{ maxWidth: 420 }}>{mensaje}</p>
      {accion}
    </div>
  );
}

export function ErrorEstado({
  error,
  onReintentar,
}: {
  error: unknown;
  onReintentar?: () => void;
}) {
  const mensaje =
    error instanceof Error && error.message
      ? error.message
      : 'No pudimos cargar la informacion. Intenta nuevamente.';

  return (
    <div className="fs-estado" role="alert">
      <span className="fs-estado__icono" aria-hidden="true">!</span>
      <h3>Algo no salio bien</h3>
      <p className="fs-sub" style={{ maxWidth: 420 }}>{mensaje}</p>
      {onReintentar && (
        <button type="button" className="fs-btn fs-btn--contorno" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}
