/** Validaciones simples y reutilizables para formularios. */

export type Errores<T> = Partial<Record<keyof T, string>>;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requerido(valor: unknown, mensaje = 'Este campo es obligatorio'): string | undefined {
  if (valor === null || valor === undefined) return mensaje;
  if (typeof valor === 'string' && valor.trim() === '') return mensaje;
  if (Array.isArray(valor) && valor.length === 0) return mensaje;
  return undefined;
}

export function email(valor: string): string | undefined {
  if (!valor.trim()) return 'El correo es obligatorio';
  return RE_EMAIL.test(valor.trim()) ? undefined : 'Ingresa un correo valido';
}

export function longitudMinima(valor: string, minimo: number): string | undefined {
  return valor.length >= minimo ? undefined : `Debe tener al menos ${minimo} caracteres`;
}

/** Misma politica que RegisterDto y CreateUserDto de NestJS. */
export function passwordRegistro(valor: string): string | undefined {
  if (valor.length < 8 || valor.length > 72) return 'La contrasena debe tener entre 8 y 72 caracteres';
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(valor)) {
    return 'Incluye al menos una mayuscula, una minuscula y un numero';
  }
  return undefined;
}

export function numeroPositivo(valor: number | string, mensaje = 'Debe ser un numero mayor a cero'): string | undefined {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? undefined : mensaje;
}

export function rangoPorcentaje(valor: number | string): string | undefined {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? undefined : 'El descuento debe estar entre 0 y 100';
}

export function hayErrores<T>(errores: Errores<T>): boolean {
  return Object.values(errores).some(Boolean);
}
