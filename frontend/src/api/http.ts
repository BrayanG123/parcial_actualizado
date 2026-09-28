/**
 * Adaptador HTTP unico de la aplicacion.
 *
 *   UI -> hook -> service -> api (este archivo) -> NestJS | mock
 *
 * Normaliza el envoltorio NestJS; cada servicio adapta su propio dominio.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { ErrorApi } from '../types/api';
import { BASE_URL, USAR_MOCKS } from './config';
import { desenvolverRespuesta, type RespuestaBackend } from './contratos';
import { endpoints } from './endpoints';
import { guardarToken, obtenerToken, revisionSesion } from './sesion';
export { USAR_MOCKS } from './config';
export { guardarToken, obtenerToken } from './sesion';

export const instancia = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/* --- normalizacion de errores --- */

const MENSAJES: Record<number, string> = {
  400: 'Los datos enviados no son validos. Revisa el formulario.',
  401: 'Tu sesion expiro. Vuelve a iniciar sesion.',
  403: 'No tienes permisos para realizar esta accion.',
  404: 'No encontramos la informacion solicitada.',
  409: 'La operacion no se pudo completar por un conflicto con datos existentes.',
  422: 'Algunos datos no cumplen con lo requerido.',
  500: 'Ocurrio un problema en el servidor. Intenta nuevamente en unos minutos.',
};

const TRADUCCIONES: Record<string, string> = {
  'Stripe is not configured': 'Stripe todavia no esta configurado en el servidor.',
  'Stripe is unavailable; retry the same operation': 'Stripe no responde. Reintenta el mismo pago para consultar su resultado.',
  'Cart or prices changed; request a new checkout preview': 'El carrito o los precios cambiaron. Revisa la nueva cotizacion antes de confirmar.',
  'Sale is no longer awaiting payment': 'El pedido ya no esta pendiente de pago. Actualiza su estado.',
  'Only unpaid digital sales can be cancelled; paid sales require a refund': 'Solo se pueden cancelar pedidos digitales pendientes de pago.',
  'File too large': 'Cada foto debe pesar como maximo 5 MB.',
  'approximateTime must be in the future': 'La visita debe tener una fecha y hora futura.',
  'The reservation is already closed': 'La reserva ya esta cerrada. Actualiza la lista.',
  'The branch must close the reservation once the customer is present':
    'La sucursal debe cerrar la reserva cuando el cliente ya esta presente.',
  'The reservation expired and its stock was released':
    'La reserva vencio y las prendas ya fueron liberadas.',
  'Stock or reservation changed concurrently; retry the operation':
    'El stock o la reserva cambiaron durante la operacion. Revisa los datos y vuelve a intentarlo.',
  'You can only consult your assigned branch':
    'Solo puedes consultar las reservas de tu sucursal asignada.',
  'You can only manage your assigned branch':
    'Solo puedes atender reservas de tu sucursal asignada.',

  'No active branch has enough available stock for this variant':
    'Ninguna sucursal tiene suficientes unidades de esta variante. Revisa la cantidad.',
  'Product or variant is no longer available':
    'La prenda o la combinacion de talla y color ya no esta disponible.',
  'Quantity per variant must be between 1 and 100':
    'La cantidad por variante debe estar entre 1 y 100.',
  'A cart can contain at most 50 variants':
    'El carrito admite como maximo 50 variantes diferentes.',
  'Cart changed concurrently; retry the operation':
    'El carrito cambio durante la operacion. Revisa los datos y vuelve a intentarlo.',
  'Inventory changed concurrently; retry the operation':
    'El inventario cambio durante la operacion. Actualiza los datos y vuelve a intentarlo.',
  'Physical quantity cannot be lower than reserved quantity':
    'El stock fisico no puede ser menor que las unidades reservadas.',
  'Movement changed concurrently or is no longer pending':
    'La entrada ya fue procesada o cambio durante la operacion. Actualiza el historial.',
  'Movement is not a pending stock entry':
    'Este movimiento no es una entrada pendiente de recepcion.',
  'You can only access your assigned branch':
    'Solo puedes consultar el inventario de tu sucursal asignada.',
  'You can only register movements in your assigned branch':
    'Solo puedes registrar movimientos en tu sucursal asignada.',

  'The user does not have a customer profile':
    'Tu cuenta no tiene perfil de cliente: solo puedes cambiar el nombre.',
  'phone must be a valid phone number': 'El telefono no tiene un formato valido.',
  'Notification was not found': 'La notificacion ya no esta disponible.',
  'Notifications are limited to your assigned branch':
    'Solo puedes ver las notificaciones de tu sucursal asignada.',
  'Too many AI requests; wait a minute and retry':
    'Hiciste muchas consultas a la IA. Espera un minuto e intenta de nuevo.',
  'Report period must span 1–366 days': 'El periodo del reporte debe abarcar entre 1 y 366 dias.',
  'Invalid report date; use YYYY-MM-DD (1900–2100)': 'La fecha del reporte no es valida.',
  'Reports are limited to your assigned branch':
    'Solo puedes consultar los reportes de tu sucursal asignada.',
  'Report access requires an administrator or branch manager':
    'Los reportes estan disponibles para administradores y encargados de sucursal.',

  'Invalid email or password': 'Correo o contrasena incorrectos.',
  'Email is already registered': 'Ya existe una cuenta registrada con ese correo.',
  Unauthorized: 'Tu sesion expiro. Vuelve a iniciar sesion.',
  'User is inactive or no longer exists': 'Tu cuenta esta desactivada o ya no existe.',
};

function normalizarError(error: unknown): ErrorApi {
  if (error instanceof ErrorApi) return error;

  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string | string[] }>;
    const status = err.response?.status ?? 0;
    if (!err.response) {
      return new ErrorApi('No pudimos conectar con el servidor. Verifica tu conexion.', 0);
    }
    const detalle = err.response.data?.message;
    const mensajes = (Array.isArray(detalle) ? detalle : detalle ? [detalle] : []).map(
      (mensaje) =>
        TRADUCCIONES[mensaje] ??
        (mensaje.startsWith('Insufficient stock or invalid variant:') || mensaje.startsWith('Insufficient stock:') || mensaje.startsWith('Unavailable product/variant in branch:')
          ? 'Una prenda ya no esta disponible en la sucursal o no tiene suficientes unidades. Revisa la seleccion.'
          : mensaje.startsWith('Invalid transition from ')
            ? 'La reserva cambio de estado. Actualiza la lista antes de continuar.'
            : mensaje),
    );
    return new ErrorApi(
      mensajes[0] ?? MENSAJES[status] ?? 'No pudimos completar la operacion.',
      status,
      undefined,
      mensajes,
    );
  }

  return new ErrorApi('Ocurrio un error inesperado.', 0);
}

/* --- API publica --- */

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Cualquier objeto de filtros de los servicios se acepta como query string. */
export type ParamsConsulta = Record<string, unknown>;

async function peticion<T>(
  metodo: Metodo,
  url: string,
  datos?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const publica = url === endpoints.auth.login || url === endpoints.auth.registro;
  const token = obtenerToken();
  const revision = revisionSesion();
  try {
    if (USAR_MOCKS) {
      const { mockRequest } = await import('../mocks');
      return await mockRequest<T>(metodo, url, datos, config?.params as ParamsConsulta);
    }
    const respuesta = await instancia.request<RespuestaBackend<T>>({
      ...config,
      method: metodo,
      url,
      data: datos,
      headers: {
        ...config?.headers,
        ...(!publica && token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return desenvolverRespuesta(respuesta.data);
  } catch (error) {
    const normalizado = normalizarError(error);
    // Una respuesta de la cuenta anterior nunca debe cerrar la nueva sesion.
    if (normalizado.status === 401 && !publica && token && revision === revisionSesion()) {
      guardarToken(null);
    }
    throw normalizado;
  }
}

export const api = {
  upload: <T>(url: string, datos: FormData) =>
    peticion<T>('POST', url, datos, {
      headers: { 'Content-Type': undefined },
      timeout: 45000,
    }),
  get: <T>(url: string, params?: object) => peticion<T>('GET', url, undefined, { params }),
  post: <T>(url: string, datos?: unknown) => peticion<T>('POST', url, datos),
  put: <T>(url: string, datos?: unknown) => peticion<T>('PUT', url, datos),
  patch: <T>(url: string, datos?: unknown) => peticion<T>('PATCH', url, datos),
  delete: <T>(url: string, datos?: unknown) => peticion<T>('DELETE', url, datos),
};
