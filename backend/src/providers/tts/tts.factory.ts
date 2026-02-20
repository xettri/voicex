import type { TTSProvider } from './tts.interface.js';
import { createEdgeTTSProvider } from './edge.provider.js';
import { createElevenLabsProvider } from './elevenlabs.provider.js';
import { createOpenAITTSProvider } from './openai.provider.js';
import { createSystemTTSProvider, type SystemTTSConfig } from './system.provider.js';

export interface TTSProviderConfig {
  elevenLabsKey?: string;
  openaiKey?: string;
  systemTts?: SystemTTSConfig;
  /** Which TTS provider to use: 'elevenlabs' | 'openai' | 'edge' */
  provider?: string;
  /** Voice or voice ID to use (voiceId for ElevenLabs, voice name for OpenAI/Edge) */
  voiceId?: string;
}

/** Selects the TTS provider based on explicit config, then falls back by API key availability. */
export function createTTSProvider(config: TTSProviderConfig): TTSProvider;
/** Legacy overload for backward compatibility */
export function createTTSProvider(
  elevenLabsKey?: string,
  openaiKey?: string,
  systemTts?: SystemTTSConfig,
): TTSProvider;
export function createTTSProvider(
  configOrKey?: TTSProviderConfig | string,
  openaiKey?: string,
  systemTts?: SystemTTSConfig,
): TTSProvider {
  // Normalise: support both the new config-object form and the old positional form
  let cfg: TTSProviderConfig;
  if (typeof configOrKey === 'object' && configOrKey !== null) {
    cfg = configOrKey;
  } else {
    cfg = { elevenLabsKey: configOrKey as string | undefined, openaiKey, systemTts };
  }

  if (cfg.systemTts?.cmd && cfg.systemTts?.ext) return createSystemTTSProvider(cfg.systemTts);

  // Explicit provider selection from agent config
  if (cfg.provider === 'elevenlabs' && typeof cfg.elevenLabsKey === 'string') {
    return createElevenLabsProvider(cfg.elevenLabsKey, cfg.voiceId);
  }
  if (cfg.provider === 'openai' && typeof cfg.openaiKey === 'string') {
    return createOpenAITTSProvider(cfg.openaiKey, cfg.voiceId);
  }
  if (cfg.provider === 'edge') {
    return createEdgeTTSProvider(cfg.voiceId);
  }

  // Fallback chain by available keys
  if (typeof cfg.elevenLabsKey === 'string') {
    return createElevenLabsProvider(cfg.elevenLabsKey, cfg.voiceId);
  }
  if (typeof cfg.openaiKey === 'string') {
    return createOpenAITTSProvider(cfg.openaiKey, cfg.voiceId);
  }
  return createEdgeTTSProvider(cfg.voiceId);
}
