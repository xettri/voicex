import type { LLMProvider, LLMMessage } from "./llm.interface.js";
import { parseOpenAIToken } from "./stream-types.js";

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    async streamCompletion(
      messages: LLMMessage[],
      onToken: (token: string) => void,
      signal?: AbortSignal
    ): Promise<void> {
      if (signal?.aborted) return;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          stream: true,
          max_tokens: 150,
          temperature: 0.7,
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          if (value === undefined) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          const last = lines.pop();
          buffer = last ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              const token = parseOpenAIToken(data);
              if (token) onToken(token);
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
  };
}
