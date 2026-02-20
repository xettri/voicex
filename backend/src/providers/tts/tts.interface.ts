export interface TTSProvider {
  streamAudio(
    text: string,
    onChunk: (audio: ArrayBuffer) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}
