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
  onAudioChunk: (audio: ArrayBuffer) => void;
  onSentenceEnd?: () => void;
}

const SENTENCE_END = /[.!?]\s*$/;
const MIN_CHARS = 20;
const FIRST_FLUSH_MS = 400;

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
      let sentenceCount = 0;
      let firstTokenTime = 0;

      let ttsChain: Promise<void> = Promise.resolve();

      const enqueueTts = (text: string): void => {
        const idx = sentenceCount++;
        ttsChain = ttsChain.then(async () => {
          if (signal?.aborted) return;
          const ttsStart = Date.now();
          try {
            await deps.tts.streamAudio(
              text,
              (chunk) => {
                if (signal?.aborted) return;
                callbacks.onAudioChunk(chunk);
              },
              signal
            );
            if (!signal?.aborted) {
              callbacks.onSentenceEnd?.();
              const ttsMs = Date.now() - ttsStart;
              if (idx === 0) {
                logger.info("First sentence audio complete", { ttsMs, chars: text.length });
              }
            }
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

      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const startTime = Date.now();

      try {
        await deps.llm.streamCompletion(
          messages,
          (token) => {
            if (signal?.aborted) return;
            fullReply += token;
            sentenceBuffer += token;

            if (!firstTokenTime) {
              firstTokenTime = Date.now();
              logger.info("First LLM token", { ttft: firstTokenTime - startTime });
              flushTimer = setTimeout(() => {
                flushTimer = null;
                if (sentenceBuffer.trim() && !signal?.aborted) {
                  logger.info("Time-based flush", { chars: sentenceBuffer.trim().length });
                  flushBuffer();
                }
              }, FIRST_FLUSH_MS);
            }

            if (SENTENCE_END.test(sentenceBuffer) && sentenceBuffer.trim().length >= 8) {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              flushBuffer();
            } else if (sentenceBuffer.length >= MIN_CHARS && SENTENCE_END.test(sentenceBuffer)) {
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
              flushBuffer();
            }
          },
          signal
        );
      } catch (err) {
        if (signal?.aborted) return;
        logger.error("LLM failed", { err, userText: userText.slice(0, 50) });
        throw err;
      } finally {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      }

      if (signal?.aborted) return;

      if (!fullReply.trim()) {
        logger.info("LLM returned empty reply, skipping", { userText: userText.slice(0, 50) });
        return;
      }

      if (sentenceBuffer.trim()) enqueueTts(sentenceBuffer.trim());

      const llmMs = Date.now() - startTime;
      logger.info("LLM done", { replyLen: fullReply.length, llmMs, sentences: sentenceCount });

      if (!signal?.aborted) {
        callbacks.onTranscript(fullReply);
      }

      await ttsChain;
    },
  };
}
