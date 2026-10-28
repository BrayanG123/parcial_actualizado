/**
 * Contratos de transporte compartidos por toda la capa de servicios.
 * Si NestJS devuelve otra envoltura, se ajusta unicamente en src/api.
 */

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ParamsPaginacion {
  page?: number;
  page_size?: number;
}

/** Error normalizado que consumen los componentes (nunca un AxiosError crudo). */
export class ErrorApi extends Error {
  readonly status: number;
  readonly detalles?: Record<string, string>;
  readonly mensajes: string[];
  /** Codigo estable del backend (p. ej. SUBSCRIPTION_READ_ONLY, PLAN_FEATURE_REQUIRED). */
  readonly codigo?: string;

  constructor(
    mensaje: string,
    status = 0,
    detalles?: Record<string, string>,
    mensajes: string[] = [mensaje],
    codigo?: string,
  ) {
    super(mensaje);
    this.codigo = codigo;
    this.name = 'ErrorApi';
    this.status = status;
    this.detalles = detalles;
    this.mensajes = mensajes.length ? mensajes : [mensaje];
  }
}
