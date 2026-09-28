import { CLAVE_TOKEN } from './config';

const oyentes = new Set<(externa: boolean) => void>();
let token: string | null = leerToken();
let revision = 0;

function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function obtenerToken(): string | null {
  return token;
}
export function revisionSesion(): number {
  return revision;
}

export function guardarToken(nuevo: string | null): void {
  token = nuevo;
  revision++;
  try {
    if (nuevo) localStorage.setItem(CLAVE_TOKEN, nuevo);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* La sesion sigue funcionando en memoria si el navegador bloquea el almacenamiento. */
  }
  oyentes.forEach((notificar) => notificar(false));
}

export function suscribirSesion(notificar: (externa: boolean) => void): () => void {
  oyentes.add(notificar);
  return () => {
    oyentes.delete(notificar);
  };
}

window.addEventListener('storage', (evento) => {
  if (evento.storageArea === localStorage && (evento.key === CLAVE_TOKEN || evento.key === null)) {
    token = leerToken();
    revision++;
    oyentes.forEach((notificar) => notificar(true));
  }
});
