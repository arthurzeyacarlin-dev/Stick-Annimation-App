import { inspectSoundOptionRecipe, synthesizeSoundOptionToDataUrl } from "../src/lib/ai/drawingSoundSynthesis.ts";
import type { DrawingAiSoundOption } from "../src/lib/ai/drawingAiContract.ts";

class NodeFileReader {
  result: string | ArrayBuffer | null = null;

  error: Error | null = null;

  onload: (() => void) | null = null;

  onerror: (() => void) | null = null;

  async readAsDataURL(blob: Blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      this.result = `data:${blob.type || "application/octet-stream"};base64,${base64}`;
      this.onload?.();
    } catch (error) {
      this.error = error instanceof Error ? error : new Error("Audio trace failed.");
      this.onerror?.();
    }
  }
}

globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;

const decodeWavDataUrl = (dataUrl: string) => {
  const [, base64] = dataUrl.split(",", 2);
  const buffer = Buffer.from(base64, "base64");
  const dataOffset = 44;
  const sampleCount = Math.max(0, (buffer.length - dataOffset) / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const int16 = buffer.readInt16LE(dataOffset + index * 2);
    samples[index] = int16 / (int16 < 0 ? 0x8000 : 0x7fff);
  }
  return samples;
};

const computeStats = (samples: Float32Array) => {
  let peak = 0;
  let sumSquares = 0;
  let zeroCrossings = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    const abs = Math.abs(value);
    if (abs > peak) {
      peak = abs;
    }
    sumSquares += value * value;
    if (index > 0 && ((samples[index - 1] >= 0 && value < 0) || (samples[index - 1] < 0 && value >= 0))) {
      zeroCrossings += 1;
    }
  }

  return {
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(sumSquares / Math.max(1, samples.length)).toFixed(4)),
    zeroCrossRate: Number((zeroCrossings / Math.max(1, samples.length - 1)).toFixed(4)),
    durationSeconds: Number((samples.length / 22050).toFixed(3)),
  };
};

const cosineSimilarity = (left: Float32Array, right: Float32Array) => {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  return dot / Math.sqrt(Math.max(leftMagnitude * rightMagnitude, 1e-12));
};

const rejectedCuePatterns = [
  /\balien\b/i,
  /\bufo\b/i,
  /\bhum\b/i,
  /\babduction\b/i,
  /\brumble\b/i,
  /\bdeep(?:er)?\b/i,
];

const timingFeel = "on the key animation beat";

const buildBeforeExplosionOptions = (): DrawingAiSoundOption[] => [
  {
    id: "safe-clean-explosion-1",
    title: "Tighter Anime Pop",
    description: "Fast compact anime blast with a sharp front hit, a small real boom body, and a short clean tail.",
    timingFeel,
    intensityFeel: "Good when the explosion should feel punchy and quick but still have a real payoff.",
    contentType: "sfx",
    speechText: null,
  },
  {
    id: "safe-clean-explosion-2",
    title: "Heavy Clean Blast",
    description: "Heavier one-event blast with a deeper body, fuller low-end bloom, and a cleaner rumble tail.",
    timingFeel,
    intensityFeel: "Best if you want a deeper heavier explosion without crunchy arcade fuzz.",
    contentType: "sfx",
    speechText: null,
  },
  {
    id: "safe-clean-explosion-3",
    title: "Staged Pre-Boom Detonation",
    description: "Short pressure-boom setup that breathes for a moment, then lands a bigger real explosion body with a satisfying tail.",
    timingFeel,
    intensityFeel: "Best for a cool staged anime detonation where the second half should clearly hit harder than the first.",
    contentType: "sfx",
    speechText: null,
  },
];

const buildAfterExplosionOptions = (prompt: string): DrawingAiSoundOption[] => {
  const normalizedPrompt = prompt.toLowerCase();
  const rejectsAlienHumExplosion =
    /\b(?:not|no|without|less)\b[^,.!?;]*\b(?:alien(?:\s+abduction)?|ufo|hum|drone|abduction)\b/i.test(normalizedPrompt);
  const rejectsDeepRumbleExplosion =
    /\b(?:not|no|without|less)\b[^,.!?;]*\b(?:deep(?:er)?|rumble)\b/i.test(normalizedPrompt);
  const heavyExplosionDescription =
    rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
      ? "Heavier one-event blast with a fuller blast body, stronger explosion weight, and a cleaner aftermath tail."
      : "Heavier one-event blast with a deeper body, fuller low-end bloom, and a cleaner rumble tail.";
  const heavyExplosionIntensityFeel =
    rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
      ? "Best if you want the strongest one-event explosion without crunchy arcade fuzz or any hovering tonal drift."
      : "Best if you want a deeper heavier explosion without crunchy arcade fuzz.";
  const stagedExplosionDescription =
    rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
      ? "Short pressure-boom setup that breathes for a moment, then lands a bigger real explosion body with a cleaner grounded aftermath."
      : "Short pressure-boom setup that breathes for a moment, then lands a bigger real explosion body with a satisfying tail.";

  return [
    {
      id: "safe-clean-explosion-1",
      title: "Tighter Anime Pop",
      description: "Fast compact anime blast with a sharp front hit, a small real boom body, and a short clean tail.",
      timingFeel,
      intensityFeel: "Good when the explosion should feel punchy and quick but still have a real payoff.",
      contentType: "sfx",
      speechText: null,
    },
    {
      id: "safe-clean-explosion-2",
      title: "Heavy Clean Blast",
      description: heavyExplosionDescription,
      timingFeel,
      intensityFeel: heavyExplosionIntensityFeel,
      contentType: "sfx",
      speechText: null,
    },
    {
      id: "safe-clean-explosion-3",
      title: "Staged Pre-Boom Detonation",
      description: stagedExplosionDescription,
      timingFeel,
      intensityFeel: "Best for a cool staged anime detonation where the second half should clearly hit harder than the first.",
      contentType: "sfx",
      speechText: null,
    },
  ];
};

const renderTrace = async (options: DrawingAiSoundOption[]) => {
  const rendered = [];
  for (const option of options) {
    const dataUrl = await synthesizeSoundOptionToDataUrl(option);
    const samples = decodeWavDataUrl(dataUrl);
    const optionText = `${option.title} ${option.description} ${option.timingFeel ?? ""} ${option.intensityFeel ?? ""}`;
    rendered.push({
      title: option.title,
      description: option.description,
      timingFeel: option.timingFeel,
      intensityFeel: option.intensityFeel,
      recipe: inspectSoundOptionRecipe(option),
      rejectedCueMatches: rejectedCuePatterns.filter((pattern) => pattern.test(optionText)).map((pattern) => pattern.source),
      stats: computeStats(samples),
      samples,
    });
  }

  const similarities = [];
  for (let leftIndex = 0; leftIndex < rendered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rendered.length; rightIndex += 1) {
      similarities.push({
        pair: `${rendered[leftIndex].title} vs ${rendered[rightIndex].title}`,
        cosine: Number(cosineSimilarity(rendered[leftIndex].samples, rendered[rightIndex].samples).toFixed(4)),
      });
    }
  }

  return {
    options: rendered.map(({ samples, ...rest }) => rest),
    similarities,
  };
};

const prompts = [
  "please generate me an explosion sound effect",
  "please generate me an explosion sound effect, not an alien abduction sound",
  "generate an explosion, not a UFO hum",
];

const main = async () => {
  const output = [];
  for (const prompt of prompts) {
    output.push({
      prompt,
      before: await renderTrace(buildBeforeExplosionOptions()),
      after: await renderTrace(buildAfterExplosionOptions(prompt)),
    });
  }

  console.log(JSON.stringify(output, null, 2));
};

void main();
