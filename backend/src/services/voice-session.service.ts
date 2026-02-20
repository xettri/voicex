import { ObjectId } from 'mongodb';
import { createLogger } from '../shared/logger.js';
import { createDeepgramProvider } from '../providers/stt/deepgram.provider.js';
import { createLLMProvider } from '../providers/llm/llm.factory.js';
import { createTTSProvider } from '../providers/tts/tts.factory.js';
import { createVoicePipelineService } from './voice-pipeline.service.js';
import { finalizeCall } from './call-summary.service.js';
import { getDb } from '../db/client.js';
import {
  createCall,
  updateCallMetrics,
  appendTranscript,
} from '../repositories/call.repository.js';
import {
  getHistory,
  saveHistory,
  type HistoryMessage,
} from '../repositories/conversation-history.repository.js';
import type { CallChannel } from '../providers/call/call.interface.js';
import type { Agent, AgentThresholds } from '../db/schema.js';

const logger = createLogger('VoiceSession');

type STTSession = { sendAudio: (chunk: ArrayBuffer) => void; close: () => void };

export interface VoiceSessionConfig {
  deepgramApiKey: string;
  llmProvider: 'ollama' | 'groq' | 'openai';
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  systemTts?: { cmd: string; ext: string };
  mongodbUri?: string;
  audioFormat?: { encoding: 'linear16' | 'mulaw'; sampleRate: number };
  agent?: Agent;
  orgId?: string;
  channel?: 'web' | 'phone';
}

const INTERRUPT_SENSITIVITY: Record<AgentThresholds['interruptionSensitivity'], number> = {
  low: 5,
  medium: 2,
  high: 1,
};

export function runVoiceSession(
  channel: CallChannel,
  sessionId: string,
  config: VoiceSessionConfig,
  clientId?: string,
  historyKey?: string,
): void {
  let sttSession: STTSession | null = null;
  const { deepgramApiKey, mongodbUri, agent } = config;
  const key = historyKey ?? sessionId;
  const thresholds = agent?.thresholds ?? {
    silenceTimeoutMs: 700,
    maxCallDurationSec: 1800,
    interruptionSensitivity: 'medium' as const,
    endpointingMs: 200,
  };
  const echoMs =
    thresholds.interruptionSensitivity === 'high'
      ? 200
      : thresholds.interruptionSensitivity === 'low'
        ? 500
        : 300;
  const minInterruptLen = INTERRUPT_SENSITIVITY[thresholds.interruptionSensitivity];

  const orgId = config.orgId ? new ObjectId(config.orgId) : undefined;
  const agentId = agent?._id ? new ObjectId(agent._id) : undefined;

  if (mongodbUri && orgId && agentId) {
    getDb()
      .then((db) => createCall(db, { orgId, agentId, sessionId, channel: config.channel ?? 'web' }))
      .catch((err) => logger.error('Failed to create call record', err));
  }

  const llmConfig = agent?.llm;
  const llm = createLLMProvider(llmConfig?.provider ?? config.llmProvider, {
    ollamaBaseUrl: config.ollamaBaseUrl,
    groqApiKey: config.groqApiKey,
    openaiApiKey: config.openaiApiKey,
  });
  const tts = createTTSProvider(config.elevenLabsApiKey, config.openaiApiKey, config.systemTts);
  const pipeline = createVoicePipelineService({ llm, tts });

  let pipelineAbortController: AbortController | null = null;
  let pipelineGeneration = 0;
  let assistantSpeaking = false;
  const MAX_HISTORY = 30;
  let conversationHistory: HistoryMessage[] = [];
  const callStartTime = Date.now();
  let callDurationTimer: ReturnType<typeof setTimeout> | null = null;

  if (thresholds.maxCallDurationSec > 0) {
    callDurationTimer = setTimeout(() => {
      logger.info('Max call duration reached', {
        sessionId,
        maxSec: thresholds.maxCallDurationSec,
      });
      channel.sendError('Maximum call duration reached');
      channel.close();
    }, thresholds.maxCallDurationSec * 1000);
  }

  getHistory(key).then((loaded) => {
    if (conversationHistory.length === 0) conversationHistory = loaded;
    logger.info('History loaded', { key, count: conversationHistory.length });
  });

  const interrupt = (): void => {
    const shouldInterrupt = assistantSpeaking || pipelineAbortController;
    if (!shouldInterrupt) return;
    logger.info('Interrupting', {
      speaking: assistantSpeaking,
      pipelineActive: !!pipelineAbortController,
    });
    channel.sendAudioStop?.();
    assistantSpeaking = false;
    if (pipelineAbortController) {
      pipelineAbortController.abort();
      pipelineAbortController = null;
    }
    if (mongodbUri) {
      getDb()
        .then((db) => updateCallMetrics(db, sessionId, { interruptions: 1 }))
        .catch(() => {});
    }
  };

  const runPipeline = (text: string): void => {
    interrupt();
    pipelineGeneration++;
    const gen = pipelineGeneration;
    const controller = new AbortController();
    pipelineAbortController = controller;
    assistantSpeaking = false;

    conversationHistory.push({ role: 'user', content: text });
    while (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();
    saveHistory(key, conversationHistory);

    if (mongodbUri) {
      getDb()
        .then((db) => {
          appendTranscript(db, sessionId, { role: 'user', content: text, timestamp: new Date() });
          updateCallMetrics(db, sessionId, { turnCount: 1 });
        })
        .catch(() => {});
    }

    const startTime = Date.now();
    logger.info('Pipeline started', { gen, text: text.slice(0, 50) });

    pipeline
      .run(
        text,
        {
          onTranscript: (reply) => {
            if (controller.signal.aborted) return;
            conversationHistory.push({ role: 'assistant', content: reply });
            saveHistory(key, conversationHistory);
            channel.sendTranscript(reply, true, 'assistant');
            if (mongodbUri) {
              getDb()
                .then((db) => {
                  appendTranscript(db, sessionId, {
                    role: 'assistant',
                    content: reply,
                    timestamp: new Date(),
                  });
                  updateCallMetrics(db, sessionId, { ttsChars: reply.length });
                })
                .catch(() => {});
            }
          },
          onAudioChunk: (audio) => {
            if (controller.signal.aborted) return;
            assistantSpeaking = true;
            channel.sendAudio(audio);
          },
          onSentenceEnd: () => {
            if (controller.signal.aborted) return;
            channel.sendAudioComplete?.();
          },
          onTTFB: (ms) => {
            if (mongodbUri) {
              getDb()
                .then((db) => updateCallMetrics(db, sessionId, { ttfbMs: ms }))
                .catch(() => {});
            }
          },
          onTokens: (count) => {
            if (mongodbUri) {
              getDb()
                .then((db) => updateCallMetrics(db, sessionId, { totalTokens: count }))
                .catch(() => {});
            }
          },
        },
        controller.signal,
        conversationHistory.slice(0, -1),
        agent?.persona,
        agent?.llm?.maxTokens ? agent.llm.maxTokens * 10 : 4096,
      )
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        conversationHistory.pop();
        logger.error('Pipeline error', err);
        channel.sendError('Assistant error');
      })
      .finally(() => {
        const elapsed = Date.now() - startTime;
        logger.info('Pipeline finished', { gen, elapsed, aborted: controller.signal.aborted });
        if (pipelineGeneration === gen) {
          pipelineAbortController = null;
          setTimeout(() => {
            if (pipelineGeneration === gen) {
              assistantSpeaking = false;
            }
          }, echoMs);
        }
      });
  };

  const FALLBACK_DEBOUNCE_MS = 60;
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
    if (text.trim()) runPipeline(text.trim());
  };

  const endpointingMs = thresholds.endpointingMs || 200;
  const sttOptions = config.audioFormat
    ? {
        encoding: config.audioFormat.encoding,
        sampleRate: config.audioFormat.sampleRate,
        endpointingMs,
      }
    : { encoding: 'linear16' as const, sampleRate: 16000, endpointingMs };
  const provider = createDeepgramProvider(deepgramApiKey, sttOptions);

  provider
    .startSession(
      (result) => {
        if (assistantSpeaking) {
          if (result.speechFinal && result.text.trim().length > minInterruptLen) {
            logger.info('User interrupted', { text: result.text.slice(0, 50) });
            interrupt();
            triggerPipeline(result.text);
          }
          return;
        }
        channel.sendTranscript(result.text, result.isFinal, 'user');
        if (result.speechFinal) {
          triggerPipeline(result.text);
        } else if (result.isFinal && result.text.trim()) {
          pendingFinalText = result.text.trim();
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (pendingFinalText) {
              triggerPipeline(pendingFinalText);
              pendingFinalText = null;
            }
          }, FALLBACK_DEBOUNCE_MS);
        }
      },
      () => {
        if (assistantSpeaking) {
          logger.info('VAD speech detected during playback');
        }
      },
    )
    .then((session) => {
      sttSession = session;
      logger.info('STT session started', { sessionId });
    })
    .catch((err: unknown) => {
      logger.error('Failed to start STT session', err);
      channel.sendError('Failed to start speech recognition');
      channel.close();
    });

  channel.onAudio((chunk) => {
    sttSession?.sendAudio(chunk);
  });

  channel.onClose(() => {
    clearDebounce();
    interrupt();
    sttSession?.close();
    if (callDurationTimer) {
      clearTimeout(callDurationTimer);
      callDurationTimer = null;
    }

    const elapsed = Math.round((Date.now() - callStartTime) / 1000);
    logger.info('Voice session closed', { sessionId, durationSec: elapsed });

    if (mongodbUri) {
      finalizeCall(sessionId, llm).catch((err) => logger.error('Summary generation failed', err));
    }
  });
}
