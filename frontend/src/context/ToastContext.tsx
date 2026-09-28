import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type TipoToast = 'info' | 'exito' | 'error';

interface Toast {
  id: number;
  texto: string;
  tipo: TipoToast;
}

interface ContextoToast {
  mostrar: (texto: string, tipo?: TipoToast) => void;
  exito: (texto: string) => void;
  error: (texto: string) => void;
}

const Contexto = createContext<ContextoToast | null>(null);

export function ProveedorToast({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const mostrar = useCallback((texto: string, tipo: TipoToast = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((actuales) => [...actuales, { id, texto, tipo }]);
    setTimeout(() => setToasts((actuales) => actuales.filter((t) => t.id !== id)), 3800);
  }, []);

  const valor = useMemo<ContextoToast>(
    () => ({
      mostrar,
      exito: (texto: string) => mostrar(texto, 'exito'),
      error: (texto: string) => mostrar(texto, 'error'),
    }),
    [mostrar],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="fs-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`fs-toast${t.tipo === 'info' ? '' : ` fs-toast--${t.tipo}`}`}>
            {t.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): ContextoToast {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useToast debe usarse dentro de ProveedorToast');
  return ctx;
}
