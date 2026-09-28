import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProductsService } from '../catalog/products/products.service.js';
import { ASSISTANT_SYSTEM } from './ai-prompts.js';
import { AiRepository } from './ai.repository.js';
import { catalogItems, promptItem, rankByQuery } from './catalog-context.js';
import { AssistantDto } from './dto/ai.dto.js';
import {
  AI_PROVIDER,
  type AiProvider,
  AiUnavailableError,
} from './providers/ai-provider.js';

const CONTEXT_PRODUCTS = 25;
const MAX_SUGGESTIONS = 4;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly repository: AiRepository,
    private readonly products: ProductsService,
  ) {}

  status() {
    return {
      provider: this.provider.name,
      model: this.provider.model,
      configured: this.provider.isConfigured(),
    };
  }

  async assistant(dto: AssistantDto) {
    const history = (dto.history ?? []).slice(-6);
    const ranked = rankByQuery(
      catalogItems(await this.repository.catalog()).filter(
        (i) => i.available > 0,
      ),
      [
        ...history.filter((t) => t.role === 'user').map((t) => t.text),
        dto.message,
      ].join(' '),
    );
    const context = ranked.slice(0, CONTEXT_PRODUCTS);
    const allowed = new Set(context.map(({ item }) => item.id));

    try {
      const output = await this.provider.generateJson({
        system: ASSISTANT_SYSTEM,
        temperature: 0.5,
        prompt: [
          `CATALOGO:\n${JSON.stringify(context.map(({ item }) => promptItem(item)))}`,
          history.length
            ? `CONVERSACION PREVIA:\n${history.map((t) => `${t.role === 'user' ? 'Cliente' : 'Asistente'}: ${t.text}`).join('\n')}`
            : '',
          `MENSAJE DEL CLIENTE:\n${dto.message}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      });
      const { reply, productIds } = parseAssistantOutput(output, allowed);
      return {
        reply,
        source: this.provider.name,
        model: this.provider.model,
        products: await this.present(productIds),
      };
    } catch (error) {
      this.warn('assistant', error);
      const matches = ranked
        .filter((r) => r.score > 0)
        .slice(0, MAX_SUGGESTIONS);
      return {
        reply: matches.length
          ? 'El asistente inteligente no esta disponible en este momento. Estas prendas con stock coinciden con tu consulta:'
          : 'El asistente inteligente no esta disponible en este momento y no encontre prendas que coincidan. Prueba indicando una categoria, un color o una temporada.',
        source: 'rules' as const,
        model: null,
        products: await this.present(matches.map(({ item }) => item.id)),
      };
    }
  }

  /** Devuelve la misma forma publica que GET /products/:id. */
  async present(ids: number[]) {
    const results = await Promise.allSettled(
      ids.map((id) => this.products.findOne(id)),
    );
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
  }

  private warn(feature: string, error: unknown) {
    if (error instanceof AiUnavailableError)
      this.logger.warn(`${feature}: ${error.message}; using rules`);
    else
      this.logger.error(
        `${feature}: unexpected AI failure`,
        error instanceof Error ? error.stack : undefined,
      );
  }
}

export function parseAssistantOutput(output: unknown, allowed: Set<number>) {
  const raw = (output ?? {}) as Record<string, unknown>;
  if (typeof raw.reply !== 'string' || !raw.reply.trim())
    throw new AiUnavailableError('AI assistant reply is empty');
  const ids = Array.isArray(raw.productIds) ? raw.productIds.map(Number) : [];
  return {
    reply: raw.reply.trim().slice(0, 1200),
    // Un id fuera del contexto seria un producto inventado o sin stock.
    productIds: [...new Set(ids.filter((id) => allowed.has(id)))].slice(
      0,
      MAX_SUGGESTIONS,
    ),
  };
}
