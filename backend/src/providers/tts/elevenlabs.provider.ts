import { createLogger } from '../../shared/logger.js';
import type { TTSProvider } from './tts.interface.js';

const logger = createLogger('ElevenLabsTTS');
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

export function createElevenLabsProvider(apiKey: string): TTSProvider {
  return {
    async streamAudio(
      text: string,
      onChunk: (audio: ArrayBuffer) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      if (signal?.aborted) return;
      if (!text.trim()) return;

      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2',
            optimize_streaming_latency: 4,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
          }),
          signal,
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error('ElevenLabs API error', { status: res.status, body: body.slice(0, 200) });
        throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 100)}`);
      }

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
