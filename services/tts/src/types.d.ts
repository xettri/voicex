declare module 'say' {
  const say: {
    speak(text: string, voice?: string, speed?: number, callback?: (err: any) => void): void;
    stop(): void;
    export(text: string, voice: string, speed: number, filename: string, callback: (err: any) => void): void;
    installedVoices: string[];
  };
  export = say;
}
