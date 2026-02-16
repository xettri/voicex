import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { createLogger } from "../../shared/logger.js";
import type { STTProvider } from "./stt.interface.js";

const logger = createLogger("DeepgramSTT");

export interface DeepgramOptions {
  encoding?: "linear16" | "mulaw" | "alaw";
  sampleRate?: number;
}

export function createDeepgramProvider(apiKey: string, options?: DeepgramOptions): STTProvider {
  return {
    async startSession(onTranscript, onSpeechStart) {
      const deepgram = createClient(apiKey);
      const opts: Record<string, unknown> = {
        model: "nova-2",
        language: "en",
        smart_format: true,
        interim_results: true,
        endpointing: 300,
        utterance_end_ms: 1000,
        vad_events: true,
      };
      if (options?.encoding) opts.encoding = options.encoding;
      if (options?.sampleRate) opts.sample_rate = options.sampleRate;

      const live = deepgram.listen.live(opts);

      let finalizedText = "";
      let connected = false;

      live.on(LiveTranscriptionEvents.Open, () => {
        connected = true;
        logger.info("Deepgram connection opened");
      });

      live.on(LiveTranscriptionEvents.Close, () => {
        connected = false;
        logger.info("Deepgram connection closed");
      });

      live.on(LiveTranscriptionEvents.SpeechStarted, () => {
        onSpeechStart?.();
      });

      live.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0];
        const isFinal = data.is_final ?? false;
        const speechFinal = data.speech_final ?? false;
        const text = transcript?.transcript ?? "";

        // Log all transcript events for debugging
        if (text) {
          logger.info("Transcript", { text: text.slice(0, 60), isFinal, speechFinal });
        }

        if (!text) return;

        if (isFinal) {
          finalizedText += (finalizedText ? " " : "") + text;
        }

        if (speechFinal && finalizedText.trim()) {
          onTranscript({
            text: finalizedText.trim(),
            isFinal: true,
            speechFinal: true,
            timestamp: Date.now(),
          });
          finalizedText = "";
        } else {
          const displayText = isFinal
            ? finalizedText
            : (finalizedText + " " + text).trim();
          onTranscript({
            text: displayText || text,
            isFinal,
            speechFinal: false,
            timestamp: Date.now(),
          });
        }
      });

      live.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        if (finalizedText.trim()) {
          logger.info("UtteranceEnd", { text: finalizedText.trim().slice(0, 50) });
          onTranscript({
            text: finalizedText.trim(),
            isFinal: true,
            speechFinal: true,
            timestamp: Date.now(),
          });
          finalizedText = "";
        }
      });

      live.on(LiveTranscriptionEvents.Error, (err: unknown) => {
        logger.error("Deepgram error", err);
      });

      const keepAliveInterval = setInterval(() => {
        try {
          if (live.getReadyState() === 1) {
            live.keepAlive();
          }
        } catch {
          /* ignore */
        }
      }, 8000);

      return {
        sendAudio(chunk: ArrayBuffer) {
          if (live.getReadyState() === 1) {
            live.send(chunk);
          }
        },
        close() {
          clearInterval(keepAliveInterval);
          try {
            live.finish();
          } catch {
            /* ignore */
          }
        },
      };
    },
  };
}
