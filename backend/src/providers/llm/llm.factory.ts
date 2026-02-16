import type { LLMProvider } from "./llm.interface.js";
import { createOllamaProvider } from "./ollama.provider.js";
import { createGroqProvider } from "./groq.provider.js";
import { createOpenAIProvider } from "./openai.provider.js";

export interface LLMProviderConfig {
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
}

/** Priority: OpenAI (standard) → Groq → Ollama. Falls back to next if requested provider has no key. */
export function createLLMProvider(
  provider: "ollama" | "groq" | "openai",
  config: LLMProviderConfig
): LLMProvider {
  if (provider === "openai" && typeof config.openaiApiKey === "string") {
    return createOpenAIProvider(config.openaiApiKey);
  }
  if (provider === "groq" && typeof config.groqApiKey === "string") {
    return createGroqProvider(config.groqApiKey);
  }
  if (provider === "ollama") {
    const baseUrl = typeof config.ollamaBaseUrl === "string" ? config.ollamaBaseUrl : "http://localhost:11434";
    return createOllamaProvider(baseUrl);
  }
  if (typeof config.openaiApiKey === "string") return createOpenAIProvider(config.openaiApiKey);
  if (typeof config.groqApiKey === "string") return createGroqProvider(config.groqApiKey);
  const baseUrl = typeof config.ollamaBaseUrl === "string" ? config.ollamaBaseUrl : "http://localhost:11434";
  return createOllamaProvider(baseUrl);
}
