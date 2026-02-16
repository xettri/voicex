import { createLogger } from "../shared/logger.js";
import { createDeepgramProvider } from "../providers/stt/deepgram.provider.js";
import { createLLMProvider } from "../providers/llm/llm.factory.js";
import { createTTSProvider } from "../providers/tts/tts.factory.js";
import { createVoicePipelineService } from "./voice-pipeline.service.js";
import { getDb } from "../db/client.js";
import { createSession, endSession } from "../repositories/session.repository.js";
import { incrementUsage } from "../repositories/usage.repository.js";
import { getHistory, saveHistory, type HistoryMessage } from "../repositories/conversation-history.repository.js";
import type { CallChannel } from "../providers/call/call.interface.js";

const logger = createLogger("VoiceSession");

type STTSession = { sendAudio: (chunk: ArrayBuffer) => void; close: () => void };

export interface VoiceSessionConfig {
  deepgramApiKey: string;
  llmProvider: "ollama" | "groq" | "openai";
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  systemTts?: { cmd: string; ext: string };
  mongodbUri?: string;
  audioFormat?: { encoding: "linear16" | "mulaw"; sampleRate: number };
}

export function runVoiceSession(
  channel: CallChannel,
  sessionId: string,
  config: VoiceSessionConfig,
  clientId?: string,
  historyKey?: string
): void {
  let sttSession: STTSession | null = null;
  const { deepgramApiKey, mongodbUri } = config;
  const key = historyKey ?? sessionId;

  if (mongodbUri) {
    getDb()
      .then((db) => createSession(db, sessionId, clientId))
      .catch((err) => logger.error("Failed to create session", err));
  }

  const llm = createLLMProvider(config.llmProvider, {
    ollamaBaseUrl: config.ollamaBaseUrl,
    groqApiKey: config.groqApiKey,
    openaiApiKey: config.openaiApiKey,
  });
  const tts = createTTSProvider(config.elevenLabsApiKey, config.openaiApiKey, config.systemTts);
  const pipeline = createVoicePipelineService({ llm, tts });

  let pipelineAbortController: AbortController | null = null;
  let pipelineGeneration = 0;
  /**
   * assistantSpeaking = true while audio is being played on the client.
   * During this time we suppress STT to prevent echo from triggering interrupts.
   * It's set true when first audio chunk is sent, and false when pipeline finishes
   * or when an explicit interrupt happens.
   */
  let assistantSpeaking = false;
  const MAX_HISTORY = 20;
  let conversationHistory: HistoryMessage[] = [];

  getHistory(key).then((loaded) => {
    if (conversationHistory.length === 0) conversationHistory = loaded;
    logger.info("History loaded", { key, count: conversationHistory.length });
  });

  const interrupt = (): void => {
    const shouldInterrupt = assistantSpeaking || pipelineAbortController;
    if (!shouldInterrupt) return;

    logger.info("Interrupting", { speaking: assistantSpeaking, pipelineActive: !!pipelineAbortController });
    channel.sendAudioStop?.();
    assistantSpeaking = false;

    if (pipelineAbortController) {
      pipelineAbortController.abort();
      pipelineAbortController = null;
    }
  };

  const runPipeline = (text: string): void => {
    interrupt();

    pipelineGeneration++;
    const gen = pipelineGeneration;
    const controller = new AbortController();
    pipelineAbortController = controller;
    assistantSpeaking = false;

    conversationHistory.push({ role: "user", content: text });
    while (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();
    saveHistory(key, conversationHistory);

    const startTime = Date.now();
    logger.info("Pipeline started", { gen, text: text.slice(0, 50), historyLen: conversationHistory.length });

    pipeline
      .run(
        text,
        {
          onTranscript: (reply) => {
            if (controller.signal.aborted) return;
            conversationHistory.push({ role: "assistant", content: reply });
            saveHistory(key, conversationHistory);
            logger.info("Pipeline transcript", { reply: reply.slice(0, 80) });
            channel.sendTranscript(reply, true, "assistant");
            if (mongodbUri && clientId) {
              getDb()
                .then((db) =>
                  incrementUsage(db, clientId, {
                    ttsChars: reply.length,
                    llmTokens: Math.ceil(reply.length / 4),
                  })
                )
                .catch(() => {});
            }
          },
          onAudioChunk: (base64) => {
            if (controller.signal.aborted) return;
            assistantSpeaking = true;
            const buf = Buffer.from(base64, "base64");
            channel.sendAudio(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
          },
          onAudioComplete: () => {
            if (controller.signal.aborted) return;
            channel.sendAudioComplete?.();
          },
        },
        controller.signal,
        conversationHistory.slice(0, -1)
      )
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        conversationHistory.pop();
        logger.error("Pipeline error", err);
        channel.sendError("Assistant error");
      })
      .finally(() => {
        const elapsed = Date.now() - startTime;
        logger.info("Pipeline finished", { gen, elapsed, aborted: controller.signal.aborted });
        if (pipelineGeneration === gen) {
          pipelineAbortController = null;
          // Give client time to finish playing the last audio chunk before re-enabling STT.
          // Without this delay, the tail end of speaker audio gets picked up as user speech.
          setTimeout(() => {
            if (pipelineGeneration === gen) {
              assistantSpeaking = false;
              logger.info("STT re-enabled after playback");
            }
          }, 800);
        }
      });
  };

  const FALLBACK_DEBOUNCE_MS = 100;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFinalText: string | null = null;

  const clearDebounce = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingFinalText = null;
  };

  const triggerPipeline = (text: string): void => {
    clearDebounce();
    if (text.trim()) {
      logger.info("Triggering pipeline", { text: text.slice(0, 50) });
      runPipeline(text.trim());
    }
  };

  const sttOptions = config.audioFormat
    ? { encoding: config.audioFormat.encoding, sampleRate: config.audioFormat.sampleRate }
    : { encoding: "linear16" as const, sampleRate: 16000 };
  const provider = createDeepgramProvider(deepgramApiKey, sttOptions);

  provider
    .startSession(
      (result) => {
        // While assistant is speaking, suppress ALL STT to prevent echo loops.
        // The user can still interrupt by speaking loud enough after playback ends.
        if (assistantSpeaking) return;

        channel.sendTranscript(result.text, result.isFinal, "user");

        if (result.speechFinal) {
          triggerPipeline(result.text);
        } else if (result.isFinal && result.text.trim()) {
          pendingFinalText = result.text.trim();
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (pendingFinalText) {
              logger.info("Fallback debounce triggered", { text: pendingFinalText.slice(0, 50) });
              triggerPipeline(pendingFinalText);
              pendingFinalText = null;
            }
          }, FALLBACK_DEBOUNCE_MS);
        }
      },
      // onSpeechStart (VAD) — disabled for interrupt. Echo from speakers triggers
      // false VAD events. Real interrupts happen via transcript → triggerPipeline.
      undefined
    )
    .then((session) => {
      sttSession = session;
      logger.info("STT session started");
    })
    .catch((err: unknown) => {
      logger.error("Failed to start STT session", err);
      channel.sendError("Failed to start speech recognition");
      channel.close();
    });

  channel.onAudio((chunk) => {
    sttSession?.sendAudio(chunk);
  });

  channel.onClose(() => {
    clearDebounce();
    interrupt();
    sttSession?.close();
    if (mongodbUri) {
      getDb().then((db) => endSession(db, sessionId)).catch(() => {});
      if (clientId) {
        getDb()
          .then((db) => incrementUsage(db, clientId, { sessions: 1 }))
          .catch(() => {});
      }
    }
    logger.info("Voice session closed", { sessionId });
  });
}
