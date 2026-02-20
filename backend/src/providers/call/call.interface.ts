/** Bidirectional audio channel used by the voice pipeline (WebSocket, Twilio, etc.) */
export interface CallChannel {
  sendAudio(chunk: ArrayBuffer): void;
  /** Called when TTS streaming is complete (e.g. for Twilio to flush buffer and convert). */
  sendAudioComplete?(): void;
  /** Called when pipeline is aborted (user spoke) – client should stop playback immediately. */
  sendAudioStop?(): void;
  sendTranscript(text: string, isFinal: boolean, role?: 'user' | 'assistant'): void;
  sendError(message: string): void;
  onAudio(cb: (chunk: ArrayBuffer) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}
