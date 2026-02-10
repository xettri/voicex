declare module 'vosk' {
  export class Model {
    constructor(modelPath: string);
    free(): void;
  }

  export class Recognizer {
    constructor(options: { model: Model; sampleRate: number });
    acceptWaveform(data: Buffer): boolean;
    result(): { text: string };
    partialResult(): { partial: string };
    free(): void;
  }
}
