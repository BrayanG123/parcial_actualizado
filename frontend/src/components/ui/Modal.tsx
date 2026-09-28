import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: boolean;
}

export function Modal({ abierto, titulo, onCerrar, children, pie, ancho }: Props) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTeclear);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = '';
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return createPortal(
    <div className="fs-modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={`fs-modal${ancho ? ' fs-modal--ancho' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="fs-modal__cabecera">
          <h3>{titulo}</h3>
          <button type="button" className="fs-btn fs-btn--fantasma" onClick={onCerrar} aria-label="Cerrar">
            &times;
          </button>
        </header>
        <div className="fs-modal__cuerpo">{children}</div>
        {pie && <footer className="fs-modal__pie">{pie}</footer>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmacionProps {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  peligro?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Confirmacion para operaciones importantes (cancelar, eliminar, cobrar). */
export function Confirmacion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  peligro,
  cargando,
  onConfirmar,
  onCancelar,
}: ConfirmacionProps) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onCerrar={onCancelar}
      pie={
        <>
          <button type="button" className="fs-btn fs-btn--contorno" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`fs-btn${peligro ? ' fs-btn--peligro' : ' fs-btn--acento'}`}
            onClick={onConfirmar}
            disabled={cargando}
          >
            {cargando ? 'Procesando...' : textoConfirmar}
          </button>
        </>
      }
    >
      <p>{mensaje}</p>
    </Modal>
  );
}
