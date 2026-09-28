/** Serializa altas/bajas: una respuesta vieja nunca vincula el dispositivo a otra cuenta. */
export interface SesionPush { userId: number; jwt: string }
interface Transporte {
  leer: () => Promise<string | null>;
  guardar: (token: string | null) => Promise<void>;
  alta: (token: string, jwt: string) => Promise<unknown>;
  baja: (token: string, jwt: string) => Promise<unknown>;
}
export class RegistroPush {
  private sesion: SesionPush | null = null;
  private revision = 0;
  private cola: Promise<unknown> = Promise.resolve();
  private registrado: string | null = null;
  private transporte: Transporte;

  constructor(transporte: Transporte) { this.transporte = transporte; }

  iniciar(sesion: SesionPush | null) {
    if (sesion?.jwt === this.sesion?.jwt && sesion?.userId === this.sesion?.userId) return;
    this.sesion = sesion;
    this.revision++;
    this.registrado = null;
  }

  private encolar<T>(accion: () => Promise<T>): Promise<T> {
    const tarea = this.cola.then(accion);
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  registrar(token: string, jwt: string): Promise<boolean> {
    const revision = this.revision;
    const sesion = this.sesion;
    return this.encolar(async () => {
      if (!sesion || sesion.jwt !== jwt || revision !== this.revision) return false;
      if (this.registrado === token) return true;
      // Recordar antes del POST, incluso si la respuesta del alta se pierde.
      await this.transporte.guardar(token);
      await this.transporte.alta(token, jwt);
      if (revision !== this.revision) {
        await this.transporte.baja(token, jwt);
        return false;
      }
      this.registrado = token;
      return true;
    });
  }

  retirar(): Promise<void> {
    const sesion = this.sesion;
    this.iniciar(null); // invalida inmediatamente altas todavia en curso
    return this.encolar(async () => {
      const token = await this.transporte.leer();
      if (token && sesion) await this.transporte.baja(token, sesion.jwt);
      await this.transporte.guardar(null);
    });
  }
}
