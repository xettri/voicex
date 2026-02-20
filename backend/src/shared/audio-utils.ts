import { mulaw } from 'alawmulaw';

/** Decode mu-law (8-bit) to 16-bit PCM. Twilio uses mu-law 8kHz. */
export function decodeMulaw(mulawBuffer: ArrayBuffer): ArrayBuffer {
  const input = new Uint8Array(mulawBuffer);
  const output = mulaw.decode(input);
  return output.buffer.slice(
    output.byteOffset,
    output.byteOffset + output.byteLength,
  ) as ArrayBuffer;
}

/** Encode 16-bit PCM to mu-law (8-bit). For Twilio outbound. */
export function encodeMulaw(pcmBuffer: ArrayBuffer): ArrayBuffer {
  const input = new Int16Array(pcmBuffer);
  const output = mulaw.encode(input);
  return output.buffer.slice(
    output.byteOffset,
    output.byteOffset + output.byteLength,
  ) as ArrayBuffer;
}
