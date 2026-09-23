import { AiUnavailableError, parseModelJson } from './ai-provider.js';
import { createAiProvider } from './create-ai-provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { OllamaProvider } from './ollama.provider.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('AI providers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the Gemini key only as a header and parses the JSON output', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"reply":"Hola"}' }] } }],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      baseUrl: 'https://example.test/v1beta/',
      timeoutMs: 1000,
    });

    await expect(
      provider.generateJson({ system: 'reglas', prompt: 'hola' }),
    ).resolves.toEqual({ reply: 'Hola' });
    const [url, init] = fetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(
      'https://example.test/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(url).not.toContain('test-key');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe('reglas');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('calls the local Ollama chat API in JSON mode', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ message: { content: '{"summary":"ok"}' } }),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = new OllamaProvider({
      baseUrl: 'http://ollama:11434',
      model: 'qwen2.5:3b',
      timeoutMs: 1000,
    });

    await expect(
      provider.generateJson({ system: 's', prompt: 'p' }),
    ).resolves.toEqual({ summary: 'ok' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/api/chat');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'qwen2.5:3b',
      format: 'json',
      stream: false,
    });
  });

  it('reports a missing key, HTTP errors and invalid JSON as unavailable', async () => {
    await expect(
      new GeminiProvider({
        model: 'gemini-2.5-flash',
        baseUrl: 'https://example.test',
        timeoutMs: 1000,
      }).generateJson({ system: '', prompt: '' }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'secret echo' }, 429)),
    );
    await expect(
      new OllamaProvider({
        baseUrl: 'http://ollama:11434',
        model: 'm',
        timeoutMs: 1000,
      }).generateJson({ system: '', prompt: '' }),
    ).rejects.toThrow('AI provider responded 429');
    expect(() => parseModelJson('no es json')).toThrow(AiUnavailableError);
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('retries once when the provider is temporarily overloaded', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      baseUrl: 'https://example.test',
      timeoutMs: 5000,
    });
    await expect(
      provider.generateJson({ system: '', prompt: '' }),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('selects the provider from configuration', () => {
    const base = {
      timeoutMs: 1000,
      requestsPerMinute: 20,
      imageTimeoutMs: 1000,
      gemini: {
        apiKey: undefined,
        model: 'gemini-2.5-flash',
        imageModel: 'gemini-3.1-flash-image',
        baseUrl: 'https://example.test',
      },
      ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:3b' },
    };
    expect(createAiProvider({ ...base, provider: 'gemini' }).name).toBe(
      'gemini',
    );
    expect(createAiProvider({ ...base, provider: 'ollama' }).name).toBe(
      'ollama',
    );
    const disabled = createAiProvider({ ...base, provider: 'none' });
    expect(disabled.isConfigured()).toBe(false);
  });
});
