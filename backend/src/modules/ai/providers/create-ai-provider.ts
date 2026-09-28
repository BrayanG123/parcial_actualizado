import { AiProvider, AiSettings, DisabledAiProvider } from './ai-provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { OllamaProvider } from './ollama.provider.js';

export function createAiProvider(settings: AiSettings): AiProvider {
  switch (settings.provider) {
    case 'ollama':
      return new OllamaProvider({
        ...settings.ollama,
        timeoutMs: settings.timeoutMs,
      });
    case 'none':
      return new DisabledAiProvider();
    default:
      return new GeminiProvider({
        ...settings.gemini,
        timeoutMs: settings.timeoutMs,
      });
  }
}
