import type { LLMProvider } from './llm.interface.js';
import { createOllamaProvider } from './ollama.provider.js';
import { createGroqProvider } from './groq.provider.js';
import { createOpenAIProvider } from './openai.provider.js';

export interface LLMProviderConfig {
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
}

export function createLLMProvider(
  provider: 'ollama' | 'groq' | 'openai',
  config: LLMProviderConfig,
  model?: string,
): LLMProvider {
  if (provider === 'openai' && typeof config.openaiApiKey === 'string') {
    return createOpenAIProvider(config.openaiApiKey, model ?? 'gpt-4o-mini');
  }
  if (provider === 'groq' && typeof config.groqApiKey === 'string') {
    return createGroqProvider(config.groqApiKey, model ?? 'llama-3.3-70b-versatile');
  }
  if (provider === 'ollama') {
    const baseUrl = config.ollamaBaseUrl ?? 'http://localhost:11434';
    return createOllamaProvider(baseUrl, model ?? 'llama3.2:3b');
  }
  // Fallback chain
  if (typeof config.openaiApiKey === 'string') {
    return createOpenAIProvider(config.openaiApiKey, model ?? 'gpt-4o-mini');
  }
  if (typeof config.groqApiKey === 'string') {
    return createGroqProvider(config.groqApiKey, model ?? 'llama-3.3-70b-versatile');
  }
  const baseUrl = config.ollamaBaseUrl ?? 'http://localhost:11434';
  return createOllamaProvider(baseUrl, model ?? 'llama3.2:3b');
}
