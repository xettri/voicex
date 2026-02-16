export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  streamCompletion(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void>;
}
