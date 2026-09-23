/**
 * Adaptador HTTP unico de la aplicacion movil.
 *
 *   Pantalla -> hook -> servicio -> api (este archivo) -> NestJS | mock
 *
 * Con la API real se desenvuelve { success, data } de NestJS y los errores se
 * traducen a mensajes para el cliente. EXPO_PUBLIC_USE_MOCKS=true conserva la
 * demo local sin backend.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { ErrorApi } from '../types/api';
import { mockRequest } from '../mocks';
import { guardarToken, obtenerToken } from './almacenamiento';
import { desenvolverRespuesta, type RespuestaBackend } from './contratos';

export const USAR_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === 'true';
export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');

export const instancia = axios.create({
  baseURL: BASE_URL,
  // Gemini y Stripe pueden tardar algunos segundos en responder.
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

instancia.interceptors.request.use((config) => {
  const token = obtenerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* --- normalizacion de errores --- */

const MENSAJES: Record<number, string> = {
  400: 'Los datos enviados no son validos. Revisa el formulario.',
  401: 'Tu sesion expiro. Vuelve a iniciar sesion.',
  403: 'Esta accion no esta disponible para tu cuenta.',
  404: 'No encontramos la informacion solicitada.',
  409: 'La operacion no se pudo completar por un conflicto con datos existentes.',
  429: 'Hiciste muchas consultas seguidas. Espera un minuto e intenta de nuevo.',
  500: 'Ocurrio un problema en el servidor. Intenta nuevamente en unos minutos.',
};

const TRADUCCIONES: Record<string, string> = {
  'Invalid email or password': 'Correo o contrasena incorrectos.',
  'Email is already registered': 'Ya existe una cuenta registrada con ese correo.',
  'User is inactive or no longer exists': 'Tu cuenta esta desactivada o ya no existe.',
  Unauthorized: 'Tu sesion expiro. Vuelve a iniciar sesion.',
  'password must contain at least one uppercase letter, one lowercase letter and one number':
    'La contrasena necesita una mayuscula, una minuscula y un numero.',
  'No active branch has enough available stock for this variant':
    'Ninguna sucursal tiene suficientes unidades de esta prenda. Revisa la cantidad.',
  'Product or variant is no longer available': 'La prenda o la combinacion de talla y color ya no esta disponible.',
  'A cart can contain at most 50 variants': 'El carrito admite como maximo 50 prendas diferentes.',
  'Cart changed concurrently; retry the operation': 'El carrito cambio. Revisa los datos y vuelve a intentarlo.',
  'Cart or prices changed; request a new checkout preview':
    'El carrito o los precios cambiaron. Revisa el nuevo total antes de confirmar.',
  'Stripe is not configured': 'El pago con tarjeta no esta habilitado en el servidor.',
  'Stripe is unavailable; retry the same operation': 'La pasarela no responde. Intenta nuevamente.',
  'Sale is no longer awaiting payment': 'El pedido ya no esta pendiente de pago.',
  'Checkout expired; create a new checkout': 'El tiempo para pagar vencio. Vuelve a confirmar tu compra.',
  'approximateTime must be in the future': 'La visita debe ser en una fecha y hora futura.',
  'The reservation is already closed': 'La reserva ya esta cerrada.',
  'The reservation expired and its stock was released': 'La reserva vencio y las prendas se liberaron.',
  'Stock or reservation changed concurrently; retry the operation':
    'El stock cambio durante la operacion. Vuelve a intentarlo.',
  'Too many AI requests; wait a minute and retry': 'Hiciste muchas consultas al asistente. Espera un minuto.',
  'Virtual try-on is not available': 'El probador con IA no esta habilitado en el servidor.',
  'Virtual try-on quota exceeded':
    'Se agoto la cuota de la IA de imagenes. Usa el probador en vivo o intenta mas tarde.',
  'Virtual try-on failed; retry': 'La IA no pudo generar la imagen. Intenta de nuevo.',
  'Product photo cannot be used for virtual try-on': 'Esta prenda no tiene una foto real para el probador con IA.',
  'The photo could not be processed; use a clear photo of one person':
    'No pudimos procesar la foto. Usa una foto clara de una sola persona.',
};

function traducir(mensaje: string): string {
  if (TRADUCCIONES[mensaje]) return TRADUCCIONES[mensaje];
  if (/^(Insufficient stock|Unavailable product\/variant)/.test(mensaje))
    return 'Una prenda ya no tiene suficientes unidades en la sucursal elegida.';
  return mensaje;
}

function normalizarError(error: unknown): ErrorApi {
  if (error instanceof ErrorApi) return error;
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string | string[] }>;
    const status = err.response?.status ?? 0;
    if (!err.response) {
      if (err.code === 'ECONNABORTED')
        return new ErrorApi('El servidor tardo demasiado en responder. Intenta nuevamente.', 0);
      return new ErrorApi('No pudimos conectar con el servidor. Revisa tu conexion y la direccion de la API.', 0);
    }
    const detalle = err.response.data?.message;
    const primero = Array.isArray(detalle) ? detalle[0] : detalle;
    return new ErrorApi(
      primero ? traducir(primero) : (MENSAJES[status] ?? 'No pudimos completar la operacion.'),
      status,
    );
  }
  return new ErrorApi('Ocurrio un error inesperado.', 0);
}

/* --- API publica --- */

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ParamsConsulta = Record<string, unknown>;

async function peticion<T>(metodo: Metodo, url: string, datos?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const token = obtenerToken();
  try {
    if (USAR_MOCKS) {
      return await mockRequest<T>(metodo, url, datos, config?.params as ParamsConsulta);
    }
    const respuesta = await instancia.request<RespuestaBackend<T>>({ method: metodo, url, data: datos, ...config });
    return desenvolverRespuesta(respuesta.data);
  } catch (error) {
    const normalizado = normalizarError(error);
    // Un token vencido no debe dejar a la app en un estado de sesion falso.
    if (normalizado.status === 401 && token && token === obtenerToken()) guardarToken(null);
    throw normalizado;
  }
}

export const api = {
  get: <T>(url: string, params?: object) => peticion<T>('GET', url, undefined, { params }),
  post: <T>(url: string, datos?: unknown, config?: AxiosRequestConfig) => peticion<T>('POST', url, datos, config),
  put: <T>(url: string, datos?: unknown) => peticion<T>('PUT', url, datos),
  patch: <T>(url: string, datos?: unknown) => peticion<T>('PATCH', url, datos),
  delete: <T>(url: string) => peticion<T>('DELETE', url),
};
