import type { TTSProvider } from './tts.interface.js';

export function createOpenAITTSProvider(apiKey: string): TTSProvider {
  return {
    async streamAudio(
      text: string,
      onChunk: (audio: ArrayBuffer) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      if (signal?.aborted) return;

      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: 'alloy',
          response_format: 'mp3',
          speed: 1.0,
        }),
        signal,
      });
      if (!res.ok) throw new Error(`OpenAI TTS error: ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done || !value) break;
          onChunk(value.buffer);
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
  };
}
