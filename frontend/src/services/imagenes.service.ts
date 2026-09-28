import { api, USAR_MOCKS } from '../api/http';

export async function subirImagen(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Selecciona una foto JPG, PNG o WebP.');
  if (file.size === 0 || file.size > 5 * 1024 * 1024)
    throw new Error('Cada foto debe pesar como maximo 5 MB.');
  if (USAR_MOCKS)
    throw new Error(
      'La subida de archivos requiere el modo de API real. En la demo puedes usar URLs.',
    );
  const body = new FormData();
  body.append('file', file);
  const result = await api.upload<{ url: string; publicId: string }>(
    '/products/images/upload',
    body,
  );
  return result.url;
}
