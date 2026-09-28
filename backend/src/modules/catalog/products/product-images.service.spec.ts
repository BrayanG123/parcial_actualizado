import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  ProductImagesService,
  MAX_IMAGE_BYTES,
} from './product-images.service.js';

describe('ProductImagesService', () => {
  const credentials: Record<string, string> = {
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: 'test-key',
    CLOUDINARY_API_SECRET: 'test-secret',
  };
  const config = { get: vi.fn((name: string) => credentials[name]) };
  const service = new ProductImagesService(config as unknown as ConfigService);
  const photo = {
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    mimetype: 'image/png',
    size: 9,
  };
  const upload = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    config.get.mockImplementation((name: string) => credentials[name]);
    vi.stubGlobal('fetch', upload);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs the upload on the server and returns only the public image reference', async () => {
    upload.mockResolvedValue({
      ok: true,
      json: async () => ({
        secure_url:
          'https://res.cloudinary.com/test-cloud/image/upload/test.png',
        public_id: 'test',
        resource_type: 'image',
      }),
    });
    expect(await service.upload(photo)).toEqual({
      url: 'https://res.cloudinary.com/test-cloud/image/upload/test.png',
      publicId: 'test',
    });
    const [url, request] = upload.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload');
    const form = request.body as FormData;
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.get('api_secret')).toBeNull();
    expect(form.get('signature')).toBe(
      createHash('sha256')
        .update(
          `folder=fashionstore/productos&timestamp=${form.get('timestamp')}test-secret`,
        )
        .digest('hex'),
    );
  });
  it('rejects empty, oversized, SVG and falsely labelled files before contacting Cloudinary', async () => {
    for (const invalid of [
      undefined,
      { ...photo, buffer: Buffer.alloc(0) },
      { ...photo, buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) },
      { ...photo, buffer: Buffer.from('<svg/>') },
      { ...photo, mimetype: 'image/jpeg' },
    ])
      await expect(service.upload(invalid)).rejects.toThrow(
        BadRequestException,
      );
    expect(upload).not.toHaveBeenCalled();
  });
  it('explains missing configuration without attempting an upload', async () => {
    config.get.mockReturnValue('');
    await expect(service.upload(photo)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(upload).not.toHaveBeenCalled();
  });
  it('does not expose upstream credentials/errors and rejects malformed success responses', async () => {
    upload.mockRejectedValue(new Error('upstream test-secret'));
    await expect(service.upload(photo)).rejects.toThrow(BadGatewayException);
    upload.mockResolvedValue({
      ok: true,
      json: async () => ({ secure_url: 'https://other.test/photo.png' }),
    });
    await expect(service.upload(photo)).rejects.toThrow(BadGatewayException);
  });
});
