import { useEffect, useRef, useState } from 'react';
import { revisionSesion } from '../../api/sesion';
import type { DocumentoReporte } from './modelo-exportacion';

export function BotonesExportar({
  cargar,
  deshabilitado = false,
}: {
  cargar: () => Promise<DocumentoReporte>;
  deshabilitado?: boolean;
}) {
  const [formato, setFormato] = useState<'pdf' | 'xlsx' | null>(null);
  const [error, setError] = useState('');
  const ocupado = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  async function exportar(tipo: 'pdf' | 'xlsx') {
    if (ocupado.current || deshabilitado) return;
    ocupado.current = true;
    setFormato(tipo);
    setError('');
    const revision = revisionSesion();
    try {
      const reporte = await cargar();
      const { prepararArchivo, descargarArchivo } = await import('./archivo-exportacion');
      const blob = await prepararArchivo(reporte, tipo);
      if (!montado.current) return;
      if (revision !== revisionSesion()) throw new Error('La sesión cambió. Vuelve a generar el reporte.');
      descargarArchivo(
        blob,
        'fashionstore-reporte-' + reporte.generado.toISOString().replace(/[:.]/g, '-') + '.' + tipo,
      );
    } catch (e) {
      if (montado.current)
        setError(e instanceof Error ? e.message : 'No se pudo exportar. Intenta nuevamente.');
    } finally {
      ocupado.current = false;
      if (montado.current) setFormato(null);
    }
  }
  return (
    <div className="fs-pila" style={{ gap: 8 }}>
      <div className="fs-fila-wrap" aria-label="Exportar reporte">
        <button
          type="button"
          className="fs-btn fs-btn--contorno fs-btn--s"
          disabled={deshabilitado || !!formato}
          onClick={() => void exportar('pdf')}
        >
          {formato === 'pdf' ? 'Generando PDF...' : 'Exportar PDF'}
        </button>
        <button
          type="button"
          className="fs-btn fs-btn--contorno fs-btn--s"
          disabled={deshabilitado || !!formato}
          onClick={() => void exportar('xlsx')}
        >
          {formato === 'xlsx' ? 'Generando Excel...' : 'Exportar Excel'}
        </button>
      </div>
      {formato && (
        <span className="fs-sub" role="status">
          Preparando el reporte completo...
        </span>
      )}
      {error && (
        <p className="fs-campo-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
