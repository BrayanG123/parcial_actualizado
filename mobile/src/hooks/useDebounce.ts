import { useEffect, useState } from 'react';

/**
 * Retrasa un valor que cambia rapido (el texto de busqueda) para no lanzar una
 * consulta por cada tecla. 350 ms es suficiente para que se sienta inmediato.
 */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [diferido, setDiferido] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);

  return diferido;
}
