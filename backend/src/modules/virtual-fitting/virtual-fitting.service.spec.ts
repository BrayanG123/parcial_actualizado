import type { AiSettings } from '../ai/providers/ai-provider.js';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import { VirtualFittingService } from './virtual-fitting.service.js';

const settings = (apiKey?: string): AiSettings => ({
  provider: 'gemini',
  timeoutMs: 1000,
  requestsPerMinute: 20,
  imageTimeoutMs: 1000,
  gemini: {
    apiKey,
    model: 'gemini-3.6-flash',
    imageModel: 'gemini-3.1-flash-image',
    baseUrl: 'https://example.test/v1beta',
  },
  ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:3b' },
});

const product = {
  id: 7,
  name: 'Chaqueta denim',
  description: 'Azul clasica',
  imageUrl: null,
  imageUrls: ['https://cdn.test/chaqueta.jpg'],
  category: { name: 'Chaquetas' },
};

const prisma = (found: unknown = product) =>
  ({
    product: { findFirst: vi.fn().mockResolvedValue(found) },
  }) as unknown as PrismaService;

const photo = (type = 'image/jpeg') =>
  new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-type': type },
  });

const dto = { productId: 7, image: 'cGVyc29uYQ==', mimeType: 'image/jpeg' };

describe('VirtualFittingService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is unavailable without a Gemini key', async () => {
    const service = new VirtualFittingService(prisma(), settings());
    expect(service.status()).toEqual({ available: false, model: null });
    await expect(service.tryOn(dto)).rejects.toThrow(
      'Virtual try-on is not available',
    );
  });

  it('sends the person and the garment photos and returns the generated image', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(photo())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { inlineData: { mimeType: 'image/png', data: 'b3V0' } },
                  ],
                },
              },
            ],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const service = new VirtualFittingService(prisma(), settings('key'));

    await expect(service.tryOn(dto)).resolves.toEqual({
      productId: 7,
      productName: 'Chaqueta denim',
      image: 'b3V0',
      mimeType: 'image/png',
      model: 'gemini-3.1-flash-image',
    });
    const [url, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      'https://example.test/v1beta/models/gemini-3.1-flash-image:generateContent',
    );
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'key' });
    const parts = JSON.parse(init.body as string).contents[0].parts;
    expect(parts[1].inlineData).toEqual({
      mimeType: 'image/jpeg',
      data: 'cGVyc29uYQ==',
    });
    expect(parts[2].inlineData).toEqual({
      mimeType: 'image/jpeg',
      data: 'AQID',
    });
  });

  it('rejects products whose photo is not a real image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photo('image/svg+xml')));
    const service = new VirtualFittingService(prisma(), settings('key'));
    await expect(service.tryOn(dto)).rejects.toThrow(
      'Product photo cannot be used for virtual try-on',
    );
  });

  it('reports exhausted quota as unavailable instead of a server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(photo())
        .mockResolvedValueOnce(new Response('{}', { status: 429 })),
    );
    const service = new VirtualFittingService(prisma(), settings('key'));
    await expect(service.tryOn(dto)).rejects.toThrow(
      'Virtual try-on quota exceeded',
    );
  });

  it('returns 404 for inactive or missing products', async () => {
    const service = new VirtualFittingService(prisma(null), settings('key'));
    await expect(service.tryOn(dto)).rejects.toThrow('Product not found');
  });
});
