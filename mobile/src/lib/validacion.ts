/** Validaciones de formulario. Mensajes en lenguaje humano, no codigos. */

export type Errores<T> = Partial<Record<keyof T, string>>;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailValido(valor: string): boolean {
  return RE_EMAIL.test(valor.trim());
}

export function requerido(valor: string | undefined | null, campo: string): string | undefined {
  return valor && valor.trim() !== '' ? undefined : `${campo} es obligatorio.`;
}

export function validarLogin(datos: { email: string; password: string }) {
  const errores: Errores<typeof datos> = {};
  if (!datos.email.trim()) errores.email = 'Ingresa tu correo.';
  else if (!emailValido(datos.email)) errores.email = 'El correo no tiene un formato valido.';
  if (!datos.password) errores.password = 'Ingresa tu contrasena.';
  return errores;
}

export function validarRegistro(datos: {
  nombre: string;
  email: string;
  password: string;
  confirmar: string;
  telefono: string;
}) {
  const errores: Errores<typeof datos> = {};
  if (!datos.nombre.trim()) errores.nombre = 'Ingresa tu nombre.';
  if (!datos.email.trim()) errores.email = 'Ingresa tu correo.';
  else if (!emailValido(datos.email)) errores.email = 'El correo no tiene un formato valido.';
  if (!datos.password) errores.password = 'Crea una contrasena.';
  else if (datos.password.length < 8 || datos.password.length > 72)
    errores.password = 'Usa entre 8 y 72 caracteres.';
  else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(datos.password))
    errores.password = 'Incluye una mayuscula, una minuscula y un numero.';
  if (datos.confirmar !== datos.password) errores.confirmar = 'Las contrasenas no coinciden.';
  if (datos.telefono && !/^[\d\s+-]{7,15}$/.test(datos.telefono)) {
    errores.telefono = 'El telefono no parece valido.';
  }
  return errores;
}

export function hayErrores(errores: Record<string, string | undefined>): boolean {
  return Object.values(errores).some(Boolean);
}
