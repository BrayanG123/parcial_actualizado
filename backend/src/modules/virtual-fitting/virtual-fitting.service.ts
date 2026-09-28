import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import aiConfig from '../../config/ai.config.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import type { AiSettings } from '../ai/providers/ai-provider.js';
import { TRY_ON_MIME_TYPES, type TryOnDto } from './dto/try-on.dto.js';

const GARMENT_MAX_BYTES = 8 * 1024 * 1024;
const GARMENT_TIMEOUT_MS = 10000;

interface InlineImage {
  mimeType: string;
  data: string;
}

interface GeminiImageResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string; inlineData?: InlineImage }>;
    };
  }>;
}

export interface TryOnResult {
  productId: number;
  productName: string;
  image: string;
  mimeType: string;
  model: string;
}

/**
 * Probador con IA: foto de la persona + foto principal de la prenda -> imagen
 * de la misma persona usando la prenda (Gemini, edicion de imagenes).
 *
 * La RA en vivo del telefono no pasa por aqui: corre en el dispositivo. Este
 * servicio es el complemento "foto realista". La foto de la persona no se
 * guarda ni se registra en logs: solo viaja al proveedor y vuelve.
 */
@Injectable()
export class VirtualFittingService {
  private readonly logger = new Logger(VirtualFittingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(aiConfig.KEY) private readonly settings: AiSettings,
  ) {}

  status() {
    return {
      available: this.isAvailable(),
      model: this.isAvailable() ? this.settings.gemini.imageModel : null,
    };
  }

  async tryOn(dto: TryOnDto): Promise<TryOnResult> {
    if (!this.isAvailable())
      throw new ServiceUnavailableException('Virtual try-on is not available');

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, active: true },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        imageUrls: true,
        category: { select: { name: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const garmentUrl = product.imageUrls[0] ?? product.imageUrl;
    const garment = await this.downloadGarment(garmentUrl);
    const model = this.settings.gemini.imageModel;
    const image = await this.generate(
      model,
      tryOnPrompt(product.name, product.category.name, product.description),
      { mimeType: dto.mimeType, data: dto.image },
      garment,
    );
    return {
      productId: product.id,
      productName: product.name,
      image: image.data,
      mimeType: image.mimeType,
      model,
    };
  }

  private isAvailable() {
    return (
      this.settings.provider === 'gemini' &&
      Boolean(this.settings.gemini.apiKey)
    );
  }

  private async downloadGarment(url: string | null): Promise<InlineImage> {
    const unusable = new UnprocessableEntityException(
      'Product photo cannot be used for virtual try-on',
    );
    if (!url || !/^https?:\/\//i.test(url)) throw unusable;
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(GARMENT_TIMEOUT_MS),
        headers: { Accept: TRY_ON_MIME_TYPES.join(',') },
      });
    } catch {
      throw unusable;
    }
    const mimeType = (response.headers.get('content-type') ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    // Los marcadores SVG de la semilla no son fotos: el modelo necesita una imagen real.
    if (!response.ok || !TRY_ON_MIME_TYPES.includes(mimeType)) throw unusable;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > GARMENT_MAX_BYTES) throw unusable;
    return { mimeType, data: bytes.toString('base64') };
  }

  private async generate(
    model: string,
    prompt: string,
    person: InlineImage,
    garment: InlineImage,
  ): Promise<InlineImage> {
    const { apiKey, baseUrl } = this.settings.gemini;
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey!,
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  { inlineData: person },
                  { inlineData: garment },
                ],
              },
            ],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: AbortSignal.timeout(this.settings.imageTimeoutMs),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Try-on provider error: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new BadGatewayException('Virtual try-on failed; retry');
    }

    // El cuerpo de error puede repetir la solicitud (la foto): solo se registra el estado.
    if (response.status === 429 || response.status === 403) {
      this.logger.warn(`Try-on provider responded ${response.status}`);
      throw new ServiceUnavailableException('Virtual try-on quota exceeded');
    }
    if (!response.ok) {
      this.logger.warn(`Try-on provider responded ${response.status}`);
      throw new BadGatewayException('Virtual try-on failed; retry');
    }

    const body = (await response.json()) as GeminiImageResponse;
    const image = body.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data,
    )?.inlineData;
    if (!image) {
      // Sin imagen suele ser un filtro de seguridad (foto no apta o sin persona).
      this.logger.warn(
        `Try-on without image: ${body.candidates?.[0]?.finishReason ?? 'no candidates'}`,
      );
      throw new UnprocessableEntityException(
        'The photo could not be processed; use a clear photo of one person',
      );
    }
    return { mimeType: image.mimeType || 'image/png', data: image.data };
  }
}

export function tryOnPrompt(
  name: string,
  category: string,
  description: string | null,
): string {
  const details = description ? ` Details: ${description.slice(0, 300)}` : '';
  return [
    'Virtual fitting room for a clothing store.',
    'Image 1 is a photo of a real customer. Image 2 is a store product photo.',
    `Product: "${name}" (category: ${category}).${details}`,
    'Generate a photorealistic image of the SAME person from image 1 wearing the product from image 2,',
    'replacing only the clothing it would cover. Preserve the face, identity, skin tone, hair, body shape,',
    'pose, background, framing and lighting of image 1. Reproduce the garment color, pattern, fabric and',
    'cut from image 2 with a natural fit, folds and shadows. Do not add text, logos or watermarks.',
  ].join(' ');
}
