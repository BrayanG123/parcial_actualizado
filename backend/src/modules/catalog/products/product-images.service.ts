import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class ProductImagesService {
  constructor(private readonly config: ConfigService) {}

  async upload(file?: UploadedImage) {
    if (!file?.buffer?.length || file.buffer.length > MAX_IMAGE_BYTES)
      throw new BadRequestException('Selecciona una imagen de hasta 5 MB');
    const bytes = file.buffer;
    const type = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? 'image/jpeg'
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : bytes.toString('ascii', 0, 4) === 'RIFF' &&
            bytes.toString('ascii', 8, 12) === 'WEBP'
          ? 'image/webp'
          : null;
    if (!type || type !== file.mimetype)
      throw new BadRequestException('Solo se admiten fotos JPG, PNG o WebP');
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const key = this.config.get<string>('CLOUDINARY_API_KEY');
    const secret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloud || !key || !secret)
      throw new ServiceUnavailableException(
        'La subida de fotos necesita configurar Cloudinary en el servidor. Puedes agregar fotos mediante URL.',
      );
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = 'fashionstore/productos';
    const signature = createHash('sha256')
      .update(`folder=${folder}&timestamp=${timestamp}${secret}`)
      .digest('hex');
    const body = new FormData();
    body.set('file', new Blob([new Uint8Array(bytes)], { type }), 'producto');
    body.set('api_key', key);
    body.set('timestamp', timestamp);
    body.set('folder', folder);
    body.set('signature', signature);
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`,
        {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error('Upload failed');
      const result = (await response.json()) as {
        secure_url?: string;
        public_id?: string;
        resource_type?: string;
      };
      if (
        !result.secure_url?.startsWith('https://res.cloudinary.com/') ||
        !result.public_id ||
        result.resource_type !== 'image'
      )
        throw new Error('Invalid upload response');
      return { url: result.secure_url, publicId: result.public_id };
    } catch {
      throw new BadGatewayException(
        'No se pudo subir la foto a Cloudinary. Revisa la conexion y la configuracion e intenta nuevamente.',
      );
    }
  }
}
