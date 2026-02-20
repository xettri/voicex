export interface VoiceConfig {
  deepgramApiKey?: string;
  llmProvider: 'ollama' | 'groq' | 'openai';
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  systemTts?: { cmd: string; ext: string };
  apiKeys: string[];
  jwtSecret?: string;
  corsOrigin: string;
  mongodbUri?: string;
  twilioAppUrl?: string;
}
