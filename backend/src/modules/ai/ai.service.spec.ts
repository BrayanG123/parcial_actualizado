import type { ProductsService } from '../catalog/products/products.service.js';
import type { AiRepository } from './ai.repository.js';
import { AiService } from './ai.service.js';
import {
  AiUnavailableError,
  type AiProvider,
} from './providers/ai-provider.js';

const row = (id: number, name: string, stock: number) => ({
  id,
  name,
  description: null,
  price: 200,
  discountPercent: 0,
  promotionStart: null,
  promotionEnd: null,
  categoryId: 1,
  seasonId: 1,
  collectionId: 1,
  category: { name: 'Vestidos' },
  season: {
    name: 'Primavera',
    active: true,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
  },
  collection: { name: 'Noche' },
  inventory: [
    {
      physicalQuantity: stock,
      reservedQuantity: 0,
      branch: { name: 'Central', city: 'La Paz' },
      size: { id: 1, name: 'M' },
      color: { id: 1, name: 'Negro' },
    },
  ],
});

describe('AiService assistant', () => {
  const provider = {
    name: 'gemini',
    model: 'gemini-2.5-flash',
    isConfigured: () => true,
    generateJson: vi.fn(),
  } satisfies AiProvider;
  const repository = { catalog: vi.fn() };
  const products = {
    findOne: vi.fn(async (id: number) => ({ id, name: `P${id}` })),
  };
  const service = new AiService(
    provider,
    repository as unknown as AiRepository,
    products as unknown as ProductsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    repository.catalog.mockResolvedValue([
      row(1, 'Vestido de noche', 3),
      { ...row(2, 'Camisa blanca', 4), category: { name: 'Camisas' } },
      row(3, 'Vestido agotado', 0),
    ]);
  });

  it('sends only stocked catalog data and drops invented product ids', async () => {
    provider.generateJson.mockResolvedValue({
      reply: 'Te sugiero el vestido de noche.',
      productIds: [1, 3, 999, 1],
    });
    const answer = await service.assistant({
      message: 'Busco un vestido para la noche',
    });

    const prompt = provider.generateJson.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Vestido de noche');
    expect(prompt).not.toContain('Vestido agotado');
    expect(answer).toMatchObject({
      source: 'gemini',
      reply: 'Te sugiero el vestido de noche.',
    });
    expect(answer.products).toEqual([{ id: 1, name: 'P1' }]);
  });

  it('falls back to catalog matches when the provider is unavailable', async () => {
    provider.generateJson.mockRejectedValue(new AiUnavailableError('timeout'));
    const answer = await service.assistant({ message: 'vestidos' });
    expect(answer.source).toBe('rules');
    expect(answer.reply).toContain('no esta disponible');
    expect(answer.products.map((p) => p.id)).toEqual([1]);
  });
});
