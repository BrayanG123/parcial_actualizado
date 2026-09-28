import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { RECOMMENDATION_SYSTEM } from './ai-prompts.js';
import { AiRepository } from './ai.repository.js';
import { AiService } from './ai.service.js';
import { catalogItems, promptItem } from './catalog-context.js';
import { RecommendationsQueryDto } from './dto/ai.dto.js';
import {
  AI_PROVIDER,
  type AiProvider,
  AiUnavailableError,
} from './providers/ai-provider.js';
import {
  buildProfile,
  scoreCandidates,
  type ScoredCandidate,
} from './recommendation-scoring.js';

const CACHE_MS = 10 * 60 * 1000;
const POPULARITY_DAYS = 90;

type Choice = { productId: number; reason: string; score: number };

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);
  private readonly cache = new Map<
    string,
    { expires: number; value: unknown }
  >();

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly repository: AiRepository,
    private readonly ai: AiService,
  ) {}

  async recommend(query: RecommendationsQueryDto, user?: AuthenticatedUser) {
    const client = user?.roles.includes(Role.CUSTOMER)
      ? await this.repository.client(user.id)
      : null;
    const key = JSON.stringify([
      client?.id ?? 0,
      query.limit,
      query.context ?? '',
      query.productId ?? 0,
    ]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    const [rows, history, sold] = await Promise.all([
      this.repository.catalog(),
      client ? this.repository.history(client.id) : null,
      this.repository.popularity(
        new Date(Date.now() - POPULARITY_DAYS * 86400000),
      ),
    ]);
    const items = catalogItems(rows);
    const profile = buildProfile(history);
    const anchor = items.find((item) => item.id === query.productId);
    const candidates = scoreCandidates(items, {
      profile,
      anchor,
      context: query.context,
      popularity: new Map(
        sold.map((row) => [row.productId, row._sum.quantity ?? 0]),
      ),
    }).slice(0, Math.min(12, query.limit * 2));

    let picks: Choice[] = candidates.slice(0, query.limit).map((c) => ({
      productId: c.item.id,
      reason: c.reasons[0],
      score: c.score,
    }));
    let source = 'rules';
    if (candidates.length)
      try {
        picks = await this.rerank(candidates, query, profile, anchor);
        source = `${this.provider.name}:${this.provider.model}`;
      } catch (error) {
        if (error instanceof AiUnavailableError)
          this.logger.warn(`recommendations: ${error.message}; using rules`);
        else throw error;
      }

    const products = new Map(
      (await this.ai.present(picks.map((p) => p.productId))).map((p) => [
        p.id,
        p,
      ]),
    );
    picks = picks.filter((p) => products.has(p.productId));
    const saved = client
      ? await this.repository.saveRecommendations(client.id, picks, source)
      : [];
    const value = picks.map((pick, index) => ({
      id: saved[index]?.id ?? null,
      clientId: client?.id ?? null,
      productId: pick.productId,
      reason: pick.reason,
      score: pick.score,
      source,
      createdAt: saved[index]?.createdAt ?? new Date(),
      product: products.get(pick.productId),
    }));
    this.cache.set(key, { expires: Date.now() + CACHE_MS, value });
    if (this.cache.size > 1000)
      this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private async rerank(
    candidates: ScoredCandidate[],
    query: RecommendationsQueryDto,
    profile: ReturnType<typeof buildProfile>,
    anchor?: ScoredCandidate['item'],
  ): Promise<Choice[]> {
    const output = await this.provider.generateJson({
      system: RECOMMENDATION_SYSTEM,
      temperature: 0.3,
      prompt: JSON.stringify({
        cantidad: query.limit,
        perfil: profile.interactions
          ? {
              categoriasPreferidas: profile.categoryNames,
              tallasHabituales: profile.sizeNames,
              coloresHabituales: profile.colorNames,
              prendasRecientes: profile.recentProducts,
            }
          : 'Cliente sin historial',
        prendaActual: anchor ? promptItem(anchor) : undefined,
        contexto: query.context,
        candidatas: candidates.map((c) => ({
          ...promptItem(c.item),
          puntaje: c.score,
          senales: c.reasons,
        })),
      }),
    });
    const scores = new Map(candidates.map((c) => [c.item.id, c]));
    const raw = (output ?? {}) as { items?: unknown };
    const chosen: Choice[] = [];
    for (const entry of Array.isArray(raw.items) ? raw.items : []) {
      const { productId, reason } = (entry ?? {}) as Record<string, unknown>;
      const candidate = scores.get(Number(productId));
      if (!candidate || chosen.some((c) => c.productId === candidate.item.id))
        continue;
      chosen.push({
        productId: candidate.item.id,
        reason:
          typeof reason === 'string' && reason.trim()
            ? reason.trim().slice(0, 240)
            : candidate.reasons[0],
        score: candidate.score,
      });
      if (chosen.length === query.limit) break;
    }
    if (!chosen.length)
      throw new AiUnavailableError('AI returned no valid recommendations');
    // Si el modelo devolvio menos prendas, se completan con el puntaje de reglas.
    for (const candidate of candidates) {
      if (chosen.length >= query.limit) break;
      if (!chosen.some((c) => c.productId === candidate.item.id))
        chosen.push({
          productId: candidate.item.id,
          reason: candidate.reasons[0],
          score: candidate.score,
        });
    }
    return chosen;
  }
}
