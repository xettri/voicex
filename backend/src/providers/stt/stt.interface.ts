export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  /** True when Deepgram detects end-of-speech (speaker paused). Faster than isFinal for turn detection. */
  speechFinal: boolean;
  timestamp: number;
}

export interface STTProvider {
  startSession(
    onTranscript: (result: TranscriptResult) => void,
    /** Called instantly when voice activity is detected (before transcription). Use for interrupt. */
    onSpeechStart?: () => void,
  ): Promise<{ sendAudio: (chunk: ArrayBuffer) => void; close: () => void }>;
}
