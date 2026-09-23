/* In-memory mono PCM. The audio thread itself enforces the sample/byte cap. */
class AssistantDictationProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.remaining = Math.min(Math.floor(sampleRate * 120), Math.floor((20 * 1024 * 1024 - 44) / 2));
    this.chunk = new Int16Array(2048);
    this.used = 0;
    this.stopped = false;
    this.port.onmessage = event => {
      if (event.data === "stop") { this.flush(); this.stopped = true; this.port.postMessage({ stopped: true }); }
      if (event.data === "cancel") { this.chunk.fill(0); this.used = 0; this.stopped = true; }
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.chunk.slice(0, this.used);
    this.chunk.fill(0); this.used = 0;
    this.port.postMessage({ samples }, [samples.buffer]);
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0]; if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (this.remaining <= 0) { this.flush(); this.stopped = true; this.port.postMessage({ limit: true }); return false; }
      let sample = 0; for (const channel of channels) sample += channel[i] || 0;
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      this.chunk[this.used++] = Math.round(sample * (sample < 0 ? 32768 : 32767)); this.remaining--;
      if (this.used === this.chunk.length) this.flush();
    }
    return true;
  }
}
registerProcessor("assistant-dictation", AssistantDictationProcessor);
