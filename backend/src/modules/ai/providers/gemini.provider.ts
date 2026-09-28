import {
  AiJsonRequest,
  AiProvider,
  AiUnavailableError,
  parseModelJson,
  postJson,
} from './ai-provider.js';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export interface GeminiOptions {
  apiKey?: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

/** Gemini API REST (generateContent) con salida JSON. */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  constructor(private readonly options: GeminiOptions) {}

  get model() {
    return this.options.model;
  }

  isConfigured() {
    return Boolean(this.options.apiKey);
  }

  async generateJson({ system, prompt, temperature = 0.4 }: AiJsonRequest) {
    const { apiKey, model, baseUrl, timeoutMs } = this.options;
    if (!apiKey)
      throw new AiUnavailableError('Gemini API key is not configured');
    const body = (await postJson(
      `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
          // thinkingBudget solo aplica a la familia 2.5 Flash; los modelos 3.x usan otra configuracion.
          ...(/gemini-2\.5-flash/.test(model)
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      },
      { 'x-goog-api-key': apiKey },
      timeoutMs,
    )) as GeminiResponse;
    return parseModelJson(
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join(''),
    );
  }
}
