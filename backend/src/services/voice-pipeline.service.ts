import { createLogger } from "../shared/logger.js";
import type { LLMProvider } from "../providers/llm/llm.interface.js";
import type { TTSProvider } from "../providers/tts/tts.interface.js";

const logger = createLogger("VoicePipeline");
const SYSTEM_PROMPT = `You are Vox, a warm and witty voice companion. You talk like a close friend — casual, upbeat, and real.

Rules:
- Keep replies to 1-3 short sentences. This is a voice conversation, not an essay.
- Be playful, use humor, light sarcasm, and genuine warmth.
- Match the user's energy — if they're down, be supportive and gentle. If they're hyped, match it.
- Use natural speech patterns: contractions, filler words occasionally ("honestly", "like", "okay so"), and reactions ("oh nice!", "wait really?", "haha").
- Never say you're an AI unless directly asked. Just be a good friend.
- If the user seems bored or sad, crack a joke, share something fun, or ask what's on their mind.
- Give real opinions when asked — don't be wishy-washy. Friends have takes.
- Remember context from this conversation and refer back to it naturally.`;

export interface PipelineDeps {
  llm: LLMProvider;
  tts: TTSProvider;
}

export interface PipelineCallbacks {
  onTranscript: (text: string) => void;
  onAudioChunk: (base64: string) => void;
  onAudioComplete?: () => void;
}

/** Flush on sentence boundaries. Only flush on actual sentence enders, not commas/semicolons. */
const SENTENCE_END = /[.!?]\s*$/;
const MIN_CHARS = 60;

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export function createVoicePipelineService(deps: PipelineDeps) {
  return {
    async run(
      userText: string,
      callbacks: PipelineCallbacks,
      signal?: AbortSignal,
      history: LLMMessage[] = []
    ): Promise<void> {
      if (signal?.aborted) return;

      const messages: LLMMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userText },
      ];

      let fullReply = "";
      let sentenceBuffer = "";

      // Use a serialized async queue backed by a chain of promises
      let ttsChain: Promise<void> = Promise.resolve();

      const enqueueTts = (text: string): void => {
        ttsChain = ttsChain.then(async () => {
          if (signal?.aborted) return;
          try {
            await deps.tts.streamAudio(
              text,
              (chunk) => {
                if (signal?.aborted) return;
                const base64 = Buffer.from(chunk).toString("base64");
                callbacks.onAudioChunk(base64);
              },
              signal
            );
            if (!signal?.aborted) callbacks.onAudioComplete?.();
          } catch (err) {
            if (signal?.aborted) return;
            const msg = err instanceof Error ? err.message : String(err);
            logger.error("TTS failed for chunk", { text: text.slice(0, 50), error: msg });
          }
        });
      };

      const flushBuffer = (): void => {
        const text = sentenceBuffer.trim();
        sentenceBuffer = "";
        if (text) enqueueTts(text);
      };

      const startTime = Date.now();

      try {
        await deps.llm.streamCompletion(
          messages,
          (token) => {
            if (signal?.aborted) return;
            fullReply += token;
            sentenceBuffer += token;
            if (SENTENCE_END.test(sentenceBuffer) || sentenceBuffer.length >= MIN_CHARS) {
              flushBuffer();
            }
          },
          signal
        );
      } catch (err) {
        if (signal?.aborted) return;
        logger.error("LLM failed", { err, userText: userText.slice(0, 50) });
        throw err;
      }

      if (signal?.aborted) return;

      if (!fullReply.trim()) {
        logger.info("LLM returned empty reply, skipping", { userText: userText.slice(0, 50) });
        return;
      }

      // Flush remaining buffer
      if (sentenceBuffer.trim()) enqueueTts(sentenceBuffer.trim());

      const llmMs = Date.now() - startTime;
      logger.info("LLM done", { replyLen: fullReply.length, llmMs });

      if (!signal?.aborted) {
        callbacks.onTranscript(fullReply);
      }

      // Wait for all TTS to finish (or abort)
      await ttsChain;
    },
  };
}
