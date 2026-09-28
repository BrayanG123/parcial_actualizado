import {
  AiJsonRequest,
  AiProvider,
  parseModelJson,
  postJson,
} from './ai-provider.js';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/** IA local: Ollama expone /api/chat en la red interna, sin claves externas. */
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama' as const;
  constructor(private readonly options: OllamaOptions) {}

  get model() {
    return this.options.model;
  }

  isConfigured() {
    return true;
  }

  async generateJson({ system, prompt, temperature = 0.4 }: AiJsonRequest) {
    const { baseUrl, model, timeoutMs } = this.options;
    const body = (await postJson(
      `${baseUrl.replace(/\/+$/, '')}/api/chat`,
      {
        model,
        stream: false,
        format: 'json',
        options: { temperature },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      },
      {},
      timeoutMs,
    )) as { message?: { content?: string } };
    return parseModelJson(body.message?.content);
  }
}
