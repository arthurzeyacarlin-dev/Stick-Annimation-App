import { DICTATION_LIMITS as LIMITS, DICTATION_MESSAGES, DictationError, transcriptText, wavHeader, type DictationCode } from "./assistantDictationContract.ts";

export type DictationView = { phase: "idle" | "requesting" | "recording" | "stopping" | "transcribing"; seconds: number; message: string; levels: number[] };
type Attempt = { id: string; stream?: MediaStream; context?: AudioContext; source?: MediaStreamAudioSourceNode; analyser?: AnalyserNode; node?: AudioWorkletNode; mute?: GainNode; timer?: ReturnType<typeof setTimeout>; frame?: number; chunks: Int16Array<ArrayBuffer>[]; count: number; bytes?: Uint8Array<ArrayBuffer>; abort: AbortController; dispatched: boolean; flush?: () => void; samples?: Float32Array<ArrayBuffer>; started: number };
const idle = (message = ""): DictationView => ({ phase: "idle", seconds: 0, message, levels: [] });

/** One attempt owns every resource. Late permission, worklet and fetch completions cannot reattach. */
export class AssistantDictationCapture {
  private active: Attempt | null = null;
  private view = idle();
  private disposed = false;
  private readonly changed: (view: DictationView) => void;
  private readonly insert: (text: string) => boolean;
  constructor(changed: (view: DictationView) => void, insert: (text: string) => boolean) { this.changed = changed; this.insert = insert; }
  private publish(view: DictationView) { this.view = view; if (!this.disposed) this.changed(view); }
  private current(a: Attempt) { return this.active === a && !this.disposed; }
  private releaseCapture(a: Attempt) {
    clearTimeout(a.timer); a.timer = undefined;
    if (a.frame !== undefined) cancelAnimationFrame(a.frame); a.frame = undefined;
    if (a.node) { a.node.port.postMessage("cancel"); a.node.port.onmessage = null; a.node.onprocessorerror = null; a.node.disconnect(); a.node.port.close(); a.node = undefined; }
    a.source?.disconnect(); a.source = undefined; a.analyser?.disconnect(); a.analyser = undefined; a.mute?.disconnect(); a.mute = undefined;
    for (const track of a.stream?.getTracks() ?? []) { track.onended = null; track.stop(); } a.stream = undefined;
    if (a.context) { a.context.onstatechange = null; void a.context.close().catch(() => {}); a.context = undefined; }
    a.samples?.fill(0); a.samples = undefined;
  }
  private discard(a: Attempt) {
    this.releaseCapture(a); for (const chunk of a.chunks) chunk.fill(0); a.chunks = []; a.count = 0; a.bytes?.fill(0); a.bytes = undefined;
    a.abort.abort(); a.flush?.(); a.flush = undefined;
  }
  cancel(message = DICTATION_MESSAGES.cancelled) {
    const a = this.active; if (!a) return; this.active = null;
    if (a) {
      this.discard(a);
      if (a.dispatched) void fetch(`/api/diamond-assistant-transcription?id=${a.id}`, { method: "DELETE", keepalive: true, signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
    this.publish(idle(message));
  }
  dispose() { this.disposed = true; this.cancel(""); }
  private fail(a: Attempt, code: DictationCode) { if (this.current(a)) this.cancel(DICTATION_MESSAGES[code]); }
  async start() {
    if (this.active || this.disposed) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) { this.publish(idle(DICTATION_MESSAGES.unsupported)); return; }
    if (!navigator.onLine) { this.publish(idle(DICTATION_MESSAGES.offline)); return; }
    const a: Attempt = { id: crypto.randomUUID(), abort: new AbortController(), chunks: [], count: 0, dispatched: false, started: 0 };
    this.active = a; this.publish({ ...idle("Allow microphone access to start dictation."), phase: "requesting" });
    a.timer = setTimeout(() => this.fail(a, "timeout"), LIMITS.permissionMs);
    try {
      // Called synchronously from the microphone click; never from an effect or mount.
      const permission = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      const stream = await permission;
      if (!this.current(a)) { stream.getTracks().forEach(track => track.stop()); return; }
      a.stream = stream;
      if (!stream.getAudioTracks().some(track => track.readyState === "live")) throw new DictationError("device");
      stream.getTracks().forEach(track => { track.onended = () => this.fail(a, "device"); });
      const context = new AudioContext({ sampleRate: 16000 }); a.context = context;
      await context.resume(); if (!this.current(a)) return;
      await context.audioWorklet.addModule("/assistant/dictation-worklet.js"); if (!this.current(a)) return;
      const source = context.createMediaStreamSource(stream); a.source = source;
      const analyser = context.createAnalyser(); analyser.fftSize = 1024; a.analyser = analyser; a.samples = new Float32Array(analyser.fftSize);
      const node = new AudioWorkletNode(context, "assistant-dictation"); a.node = node;
      const mute = context.createGain(); mute.gain.value = 0; a.mute = mute;
      source.connect(analyser); analyser.connect(node); node.connect(mute); mute.connect(context.destination);
      node.onprocessorerror = () => this.fail(a, "device");
      node.port.onmessage = event => {
        const chunk = event.data.samples;
        if (!this.current(a)) { if (chunk instanceof Int16Array) chunk.fill(0); return; }
        if (chunk instanceof Int16Array) {
          if ((a.count + chunk.length) * 2 + 44 > LIMITS.bytes || a.count + chunk.length > context.sampleRate * LIMITS.seconds) { chunk.fill(0); this.fail(a, "limit"); return; }
          a.chunks.push(chunk as Int16Array<ArrayBuffer>); a.count += chunk.length;
        }
        if (event.data.limit) this.fail(a, "limit");
        if (event.data.stopped) a.flush?.();
      };
      a.started = performance.now(); clearTimeout(a.timer);
      a.timer = setTimeout(() => this.fail(a, "limit"), LIMITS.seconds * 1000);
      context.onstatechange = () => { if (this.current(a) && this.view.phase === "recording" && context.state !== "running") this.fail(a, "device"); };
      this.publish({ ...idle("Listening. Stop to turn your recording into editable text."), phase: "recording" });
      let lastDraw = 0;
      const draw = (now: number) => {
        if (!this.current(a) || this.view.phase !== "recording" || !a.samples) return;
        if (now - a.started >= LIMITS.seconds * 1000) { this.fail(a, "limit"); return; }
        if (now - lastDraw >= 50) {
          lastDraw = now; analyser.getFloatTimeDomainData(a.samples);
          const levels = Array.from({ length: 32 }, (_, bin) => {
            let peak = 0; for (let j = bin * 32; j < bin * 32 + 4; j++) peak = Math.max(peak, Math.abs(a.samples![j]));
            return Math.min(1, peak * 1.6);
          });
          this.publish({ ...this.view, seconds: Math.min(LIMITS.seconds, (now - a.started) / 1000), levels });
        }
        a.frame = requestAnimationFrame(draw);
      };
      a.frame = requestAnimationFrame(draw);
    } catch (error) {
      const code = error instanceof DictationError ? error.code : error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name) ? "permission" : error instanceof DOMException && ["NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"].includes(error.name) ? "device" : "unsupported";
      this.fail(a, code);
    }
  }
  async stop() {
    const a = this.active; if (!a || this.view.phase !== "recording") return;
    this.publish({ ...this.view, phase: "stopping", message: "Finishing the recording…", levels: [] });
    clearTimeout(a.timer); a.timer = undefined;
    for (const track of a.stream?.getTracks() ?? []) { track.onended = null; track.stop(); }
    const rate = a.context!.sampleRate;
    try {
      await new Promise<void>((resolve, reject) => { a.flush = resolve; a.timer = setTimeout(() => reject(new DictationError("timeout")), 1500); a.node!.port.postMessage("stop"); });
      if (!this.current(a)) return;
      this.releaseCapture(a); a.flush = undefined;
      if (a.count < rate * .15) throw new DictationError("empty");
      const bytes = new Uint8Array(44 + a.count * 2); a.bytes = bytes; bytes.set(wavHeader(a.count, rate));
      const view = new DataView(bytes.buffer); let index = 44;
      for (const chunk of a.chunks) { for (const sample of chunk) { view.setInt16(index, sample, true); index += 2; } chunk.fill(0); }
      a.chunks = []; a.count = 0;
      if (!navigator.onLine) throw new DictationError("offline");
      this.publish({ ...this.view, phase: "transcribing", message: "Transcribing… You can keep typing or cancel." });
      a.timer = setTimeout(() => this.fail(a, "timeout"), LIMITS.timeoutMs);
      a.dispatched = true;
      const response = await fetch("/api/diamond-assistant-transcription", { method: "POST", headers: { "Content-Type": "audio/wav", "X-Dictation-Id": a.id }, body: bytes, signal: a.abort.signal, cache: "no-store" });
      bytes.fill(0); a.bytes = undefined;
      if (!this.current(a)) return;
      const reader = response.body?.getReader(); if (!reader) throw new DictationError("invalid");
      let text = ""; let size = 0; const decoder = new TextDecoder();
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > LIMITS.responseBytes) { await reader.cancel(); throw new DictationError("invalid"); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
      if (!this.current(a)) return;
      const result = JSON.parse(text);
      if (!response.ok) throw new DictationError(Object.hasOwn(DICTATION_MESSAGES, result.code) ? result.code : "provider");
      if (result.id !== a.id) throw new DictationError("invalid");
      const transcript = transcriptText(result.text);
      const inserted = this.insert(transcript);
      this.active = null; this.discard(a);
      this.publish(idle(inserted ? "Transcript added. Edit it, then press Send when you’re ready." : "There isn’t enough room in this draft for the transcript. Shorten your draft and record again. Nothing was overwritten."));
    } catch (error) { this.fail(a, error instanceof DictationError ? error.code : !navigator.onLine ? "offline" : "provider"); }
  }
}
