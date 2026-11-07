/**
 * Codigo de tienda (slug de la empresa). Es el mismo formato que valida el backend y la web:
 * minusculas, numeros y guiones, sin guion al inicio ni al final.
 */
const CODIGO = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export function normalizarCodigo(valor: string): string {
  return valor.trim().toLowerCase();
}

export function validarCodigo(valor: string): string | undefined {
  const codigo = normalizarCodigo(valor);
  if (!codigo) return 'Ingresa el codigo de la tienda';
  return CODIGO.test(codigo) ? undefined : 'Usa solo minusculas, numeros y guiones';
}
