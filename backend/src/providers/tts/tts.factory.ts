import type { TTSProvider } from "./tts.interface.js";
import { createEdgeTTSProvider } from "./edge.provider.js";
import { createElevenLabsProvider } from "./elevenlabs.provider.js";
import { createOpenAITTSProvider } from "./openai.provider.js";
import { createSystemTTSProvider, type SystemTTSConfig } from "./system.provider.js";

/** Priority: System (local) → ElevenLabs → OpenAI → Edge (fallback) */
export function createTTSProvider(
  elevenLabsKey?: string,
  openaiKey?: string,
  systemTts?: SystemTTSConfig
): TTSProvider {
  if (systemTts?.cmd && systemTts?.ext) return createSystemTTSProvider(systemTts);
  if (typeof elevenLabsKey === "string") return createElevenLabsProvider(elevenLabsKey);
  if (typeof openaiKey === "string") return createOpenAITTSProvider(openaiKey);
  return createEdgeTTSProvider();
}
