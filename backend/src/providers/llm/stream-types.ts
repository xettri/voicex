/** Ollama streaming response chunk */
export interface OllamaStreamChunk {
  message?: { content?: string };
}

/** OpenAI streaming response chunk */
export interface OpenAIStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export function parseOllamaToken(data: string): string {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed !== "object" || parsed === null) return "";
    const chunk = parsed as OllamaStreamChunk;
    return chunk.message?.content ?? "";
  } catch {
    return "";
  }
}

export function parseOpenAIToken(data: string): string {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed !== "object" || parsed === null) return "";
    const chunk = parsed as OpenAIStreamChunk;
    const choices = chunk.choices;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    const content = first?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}
