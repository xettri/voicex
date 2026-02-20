import type { LLMProvider, LLMMessage } from './llm.interface.js';
import { parseOllamaToken } from './stream-types.js';

const LLM_TIMEOUT_MS = 15_000;

export function createOllamaProvider(baseUrl: string, model = 'llama3.2:3b'): LLMProvider {
  return {
    async streamCompletion(
      messages: LLMMessage[],
      onToken: (token: string) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      if (signal?.aborted) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          controller.abort();
          return;
        }
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            options: {
              num_predict: 100,
              temperature: 0.7,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          if (value === undefined) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          const last = lines.pop();
          buffer = last ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
            if (data === '[DONE]') continue;
            const token = parseOllamaToken(data);
            if (token) onToken(token);
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
  };
}
