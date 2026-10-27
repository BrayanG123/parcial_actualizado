/** Exclusion mutua entre pestanas (Web Locks) con respaldo en memoria. */
const cadenas = new Map<string, Promise<unknown>>();

export function conBloqueo<T>(nombre: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`fs-offline:${nombre}`, fn);
  const previa = cadenas.get(nombre) ?? Promise.resolve();
  const actual = previa.catch(() => undefined).then(fn);
  cadenas.set(nombre, actual);
  return actual;
}
