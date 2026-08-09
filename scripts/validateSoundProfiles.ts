import { synthesizeSoundOptionToDataUrl } from "../src/lib/ai/drawingSoundSynthesis.ts";
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
      this.error = error instanceof Error ? error : new Error("Audio validation failed.");
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

const canonicalSets: Record<string, DrawingAiSoundOption[]> = {
  explosion: [
    {
      id: "validate-explosion-1",
      title: "Tighter Anime Pop",
      description: "Fast compact anime blast with a sharp front hit, a small real boom body, and a short clean tail.",
      timingFeel: "on the key animation beat",
      intensityFeel: "Good when the explosion should feel punchy and quick but still have a real payoff.",
    },
    {
      id: "validate-explosion-2",
      title: "Heavy Clean Blast",
      description: "Heavier one-event blast with a deeper body, fuller low-end bloom, and a cleaner rumble tail.",
      timingFeel: "on the key animation beat",
      intensityFeel: "Best if you want a deeper heavier explosion without crunchy arcade fuzz.",
    },
    {
      id: "validate-explosion-3",
      title: "Staged Pre-Boom Detonation",
      description: "Short pressure-boom setup that breathes for a moment, then lands a bigger real explosion body with a satisfying tail.",
      timingFeel: "on the key animation beat",
      intensityFeel: "Best for a cool staged anime detonation where the second half should clearly hit harder than the first.",
    },
  ],
  bone: [
    {
      id: "validate-bone-1",
      title: "Dry Bone Snap",
      description: "Dry sharp bone snap with a brittle top crack and a tiny body-hit weight.",
      timingFeel: null,
      intensityFeel: "Fast, dry, and controlled.",
    },
    {
      id: "validate-bone-2",
      title: "Nasty Fracture Crack",
      description: "Ugly short bone fracture with splinter detail and a nastier break texture.",
      timingFeel: null,
      intensityFeel: "More brutal without turning boomy.",
    },
    {
      id: "validate-bone-3",
      title: "Brittle Bone Break",
      description: "Cleaner brittle bone break with a sharper top crack and a slightly heavier body hit.",
      timingFeel: null,
      intensityFeel: "Crisp readable break without a long tail.",
    },
  ],
  door: [
    {
      id: "validate-door-1",
      title: "Dry Hinge Creak",
      description: "Lighter drier hinge pulses with minimal room around the motion.",
      timingFeel: null,
      intensityFeel: "Best for a simple readable hinge sound.",
    },
    {
      id: "validate-door-2",
      title: "Heavy Old Wood Groan",
      description: "Lower slower old wood groan with more mass and pressure in the opening motion.",
      timingFeel: null,
      intensityFeel: "Use when the door should feel older and heavier.",
    },
    {
      id: "validate-door-3",
      title: "Thin Eerie Hallway Creak",
      description: "Thinner hallway creak with emptier space around the slow opening door.",
      timingFeel: null,
      intensityFeel: "Best when the doorway should feel more unsettling.",
    },
  ],
  wind: [
    {
      id: "validate-wind-1",
      title: "Soft Back Wind",
      description: "Airy soft wind bed with gentle movement and restrained distant wash.",
      timingFeel: null,
      intensityFeel: "Subtle outside air behind the action.",
    },
    {
      id: "validate-wind-2",
      title: "Moodier Low Wind",
      description: "Lower fuller wind pass with calmer body and more outdoor weight.",
      timingFeel: null,
      intensityFeel: "More atmosphere without sounding stormy.",
    },
    {
      id: "validate-wind-3",
      title: "Sharper Gust Pass",
      description: "Cleaner gust with a clearer front edge and quicker drift-off.",
      timingFeel: null,
      intensityFeel: "Wind movement should read more clearly.",
    },
  ],
  button: [
    {
      id: "validate-button-1",
      title: "Soft Confirm Beep",
      description: "Short clean confirmation tone with a tiny click and soft electronic pulse.",
      timingFeel: null,
      intensityFeel: "Subtle UI confirmation.",
    },
    {
      id: "validate-button-2",
      title: "Brighter UI Click-Beep",
      description: "Small tech click followed by a brighter menu beep with quick cutoff.",
      timingFeel: null,
      intensityFeel: "Button press should read a little clearer.",
    },
    {
      id: "validate-button-3",
      title: "Cleaner Muted Menu Pulse",
      description: "Muted interface pulse with a clean chirp and very controlled release.",
      timingFeel: null,
      intensityFeel: "Least distorted and least arcadey result.",
    },
  ],
  lightning: [
    {
      id: "validate-lightning-1",
      title: "Flash Crack Strike",
      description: "Sharp lightning flash-crack with a tight strike body and quick thunder follow-through.",
      timingFeel: null,
      intensityFeel: "Reads sharply on the flash.",
    },
    {
      id: "validate-lightning-2",
      title: "Heavy Thunder Strike",
      description: "Stronger lightning hit with a fuller thunder body and more storm weight after the crack.",
      timingFeel: null,
      intensityFeel: "Bigger and more physical after the flash.",
    },
    {
      id: "validate-lightning-3",
      title: "Rolling Storm Tail",
      description: "Crisp lightning start that opens into a longer rolling thunder tail.",
      timingFeel: null,
      intensityFeel: "Clearer aftershock and storm-space finish.",
    },
  ],
};

const validateSet = async (name: string, options: DrawingAiSoundOption[]) => {
  const rendered = [];
  for (const option of options) {
    const dataUrl = await synthesizeSoundOptionToDataUrl(option);
    const samples = decodeWavDataUrl(dataUrl);
    rendered.push({
      title: option.title,
      samples,
      stats: computeStats(samples),
    });
  }

  const similarities: Array<{ pair: string; cosine: number }> = [];
  for (let leftIndex = 0; leftIndex < rendered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rendered.length; rightIndex += 1) {
      similarities.push({
        pair: `${rendered[leftIndex].title} vs ${rendered[rightIndex].title}`,
        cosine: Number(cosineSimilarity(rendered[leftIndex].samples, rendered[rightIndex].samples).toFixed(4)),
      });
    }
  }

  return {
    name,
    options: rendered.map(({ title, stats }) => ({ title, ...stats })),
    similarities,
  };
};

const main = async () => {
  const output = [];
  for (const [name, options] of Object.entries(canonicalSets)) {
    output.push(await validateSet(name, options));
  }
  console.log(JSON.stringify(output, null, 2));
};

void main();
