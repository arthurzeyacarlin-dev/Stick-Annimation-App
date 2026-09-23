// Shared by the microphone and its separate server boundary. No chat/project state.
export const DICTATION_LIMITS = Object.freeze({ seconds: 120, bytes: 20 * 1024 * 1024, timeoutMs: 45000, permissionMs: 30000, outputChars: 6000, outputBytes: 12000, responseBytes: 64000, active: 2, identities: 500, usdPerMinute: 0.0045, maxUsd: 0.009 });
export const TRANSCRIPTION_MODEL = "gpt-transcribe";
export type DictationCode = "permission" | "device" | "unsupported" | "empty" | "format" | "limit" | "offline" | "provider" | "timeout" | "cancelled" | "capacity" | "invalid" | "configuration";
export class DictationError extends Error {
  readonly code: DictationCode;
  constructor(code: DictationCode) { super(DICTATION_MESSAGES[code]); this.code = code; }
}
export const DICTATION_MESSAGES: Record<DictationCode, string> = {
  permission: "Microphone access was denied. Allow it in your browser settings, or keep typing.",
  device: "The microphone is unavailable or disconnected. Check your input device and try again, or keep typing.",
  unsupported: "Dictation is unavailable in this browser. You can still type your message.",
  empty: "No speech was captured. Try again and speak into your microphone, or keep typing.",
  format: "This recording format could not be read. Please record again, or keep typing.",
  limit: "The recording reached its limit and was discarded. Record a shorter message, or keep typing.",
  offline: "You’re offline. The recording was discarded. Reconnect to record again, or keep typing.",
  provider: "Transcription could not finish. The recording was discarded. Try recording again, or keep typing.",
  timeout: "Dictation timed out. The recording was discarded. Try again, or keep typing.",
  cancelled: "Dictation cancelled. Nothing was inserted.",
  capacity: "Dictation is busy. The recording was discarded. Try again shortly, or keep typing.",
  invalid: "The transcript could not be verified. Nothing was inserted. Try again, or keep typing.",
  configuration: "Transcription is not configured on this review server. You can still type your message.",
};
export const isDictationId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function transcriptText(value: unknown): string {
  if (typeof value !== "string" || value.length > DICTATION_LIMITS.outputChars || new TextEncoder().encode(value).length > DICTATION_LIMITS.outputBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new DictationError("invalid");
  const text = value.trim(); if (!text) throw new DictationError("empty"); return text;
}
export function wavHeader(frames: number, rate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44); const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, 36 + frames * 2, true); tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, frames * 2, true); return bytes;
}
export function validateWav(bytes: Uint8Array, mime: string) {
  if (bytes.byteLength > DICTATION_LIMITS.bytes) throw new DictationError("limit");
  if (mime !== "audio/wav" || bytes.byteLength < 46) throw new DictationError("format");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  const rate = view.getUint32(24, true); const size = view.getUint32(40, true);
  if (!tag(0, "RIFF") || !tag(8, "WAVE") || !tag(12, "fmt ") || !tag(36, "data") || view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || ![16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000].includes(rate) || view.getUint32(28, true) !== rate * 2 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 || size !== bytes.length - 44 || size % 2) throw new DictationError("format");
  const seconds = size / 2 / rate;
  if (seconds > DICTATION_LIMITS.seconds) throw new DictationError("limit");
  let peak = 0; for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  if (seconds < 0.15 || peak < 16) throw new DictationError("empty");
  return { seconds, rate, estimatedUsd: seconds / 60 * DICTATION_LIMITS.usdPerMinute };
}
