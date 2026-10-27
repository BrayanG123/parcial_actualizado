/** JSON canonico (claves ordenadas) + SHA-256: identico al calculo del backend. */
export function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object')
    return `{${Object.keys(valor)
      .sort()
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(valor);
}

export async function hashPayload(payload: unknown): Promise<string> {
  const datos = new TextEncoder().encode(canonico(payload));
  const digest = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
