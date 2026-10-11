"use client";

import type { NotificationVolume } from "@/src/lib/account/appSettings";

// SPEC-0020 Phase 3 (Arthur): a "ding ding" when a notification arrives, made in the browser (no sound file).
// Browsers only allow sound after the person has clicked or typed on the page once.
let context: AudioContext | null = null;
const VOLUME: Record<NotificationVolume, number> = { quiet: 0.18, normal: 0.42, loud: 0.75 };

function tone(audio: AudioContext, out: AudioNode, frequency: number, start: number, length: number, volume: number) {
  const oscillator = audio.createOscillator();
  const overtone = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  overtone.type = "sine";
  oscillator.frequency.value = frequency;
  overtone.frequency.value = frequency * 2.76; // a bell's bright overtone
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain);
  overtone.connect(gain);
  gain.connect(out);
  oscillator.start(start);
  overtone.start(start);
  oscillator.stop(start + length + 0.05);
  overtone.stop(start + length + 0.05);
}

export function playNotificationDing(volume: NotificationVolume = "normal") {
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    context = context ?? new AudioCtor();
    if (context.state === "suspended") void context.resume();
    // A limiter keeps the louder settings clean (no crackle).
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.connect(context.destination);
    const level = VOLUME[volume];
    const now = context.currentTime + 0.02;
    tone(context, limiter, 1318.5, now, 0.55, level);              // E6 — "ding"
    tone(context, limiter, 1567.98, now + 0.16, 0.7, level * 0.9); // G6 — "ding"
  } catch {
    // No sound is fine; the bell still rings and the dots still show.
  }
}
