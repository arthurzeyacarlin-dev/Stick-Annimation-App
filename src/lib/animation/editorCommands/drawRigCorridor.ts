/**
 * Causal freehand-to-chord simplification for Draw Rig.
 *
 * The settled prefix is append-only. Only the current endpoint can move, and
 * every emitted bend is an accepted input point. Geometry is intentionally
 * independent of brush styling, transparency, event timing, and smoothing.
 */
export type DrawRigPoint = { x: number; y: number };

export const DRAW_RIG_CORRIDOR_ALGORITHM = "causal-fixed-corridor/v3";
export const DRAW_RIG_CORRIDOR_DEFAULTS = Object.freeze({
  // A normal hand wobble can roam inside this spatial corridor without
  // manufacturing a bend. Crossing it still promotes the last visible point
  // immediately; there is no timer, confirmation window, or replay.
  // One extra authoring unit over v2 is deliberately narrow: it absorbs the
  // short curved wobble that could split one elbow into two bends, while the
  // retained nook fixture still crosses the corridor and remains editable.
  tolerance: 11,
  minimumSampleDistance: 0.75,
  // Keep the first few spatial samples live long enough that one biased mouse
  // sample does not freeze the direction of the entire run.
  directionSettleDistance: 12,
});

export type DrawRigCorridorOptions = {
  tolerance?: number;
  minimumSampleDistance?: number;
  directionSettleDistance?: number;
};

export type DrawRigCorridorUpdate = {
  accepted: boolean;
  started: boolean;
  tail: DrawRigPoint | null;
  lockedSegment: { from: DrawRigPoint; to: DrawRigPoint } | null;
  acceptedSampleCount: number;
  workUnits: number;
};

const round = (value: number) => Math.round(value * 1000) / 1000;
const distance = (a: DrawRigPoint, b: DrawRigPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const samePoint = (a: DrawRigPoint, b: DrawRigPoint) => a.x === b.x && a.y === b.y;
const copyPoint = (point: DrawRigPoint): DrawRigPoint => ({ x: point.x, y: point.y });

export class DrawRigCorridor {
  readonly tolerance: number;
  readonly minimumSampleDistance: number;
  readonly directionSettleDistance: number;

  private readonly lockedVertices: DrawRigPoint[] = [];
  private anchor: DrawRigPoint | null = null;
  private tail: DrawRigPoint | null = null;
  private lastAccepted: DrawRigPoint | null = null;
  private direction: DrawRigPoint | null = null;
  private terminal = false;
  private acceptedSamples = 0;
  private operations = 0;

  constructor(options: DrawRigCorridorOptions = {}) {
    this.tolerance = options.tolerance ?? DRAW_RIG_CORRIDOR_DEFAULTS.tolerance;
    this.minimumSampleDistance = options.minimumSampleDistance ?? DRAW_RIG_CORRIDOR_DEFAULTS.minimumSampleDistance;
    this.directionSettleDistance = options.directionSettleDistance ?? DRAW_RIG_CORRIDOR_DEFAULTS.directionSettleDistance;
    if (
      !Number.isFinite(this.tolerance) || this.tolerance <= 0 || this.tolerance > 1024 ||
      !Number.isFinite(this.minimumSampleDistance) || this.minimumSampleDistance <= 0 || this.minimumSampleDistance > this.tolerance ||
      !Number.isFinite(this.directionSettleDistance) || this.directionSettleDistance < this.minimumSampleDistance || this.directionSettleDistance > 4096
    ) {
      throw new Error("invalid_draw_rig_corridor_options");
    }
  }

  append(input: DrawRigPoint): DrawRigCorridorUpdate {
    if (this.terminal) return this.update(false, false, null);
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) throw new Error("invalid_draw_rig_sample");
    const point = { x: round(input.x), y: round(input.y) };
    this.operations += 1;

    if (this.lastAccepted && distance(this.lastAccepted, point) < this.minimumSampleDistance) {
      this.operations += 1;
      return this.update(false, false, null);
    }

    this.lastAccepted = point;
    this.acceptedSamples += 1;
    this.operations += 1;
    if (!this.anchor) {
      this.anchor = point;
      this.tail = point;
      this.lockedVertices.push(point);
      return this.update(true, true, null);
    }

    const anchor = this.anchor;
    const previousTail = this.tail ?? anchor;
    const fromAnchorX = point.x - anchor.x;
    const fromAnchorY = point.y - anchor.y;
    const fromAnchorDistance = Math.hypot(fromAnchorX, fromAnchorY);
    this.operations += 2;

    if (!this.direction) {
      this.tail = point;
      if (fromAnchorDistance >= this.directionSettleDistance) {
        this.direction = { x: fromAnchorX / fromAnchorDistance, y: fromAnchorY / fromAnchorDistance };
        this.operations += 2;
      }
      return this.update(true, false, null);
    }

    const along = fromAnchorX * this.direction.x + fromAnchorY * this.direction.y;
    const across = fromAnchorX * this.direction.y - fromAnchorY * this.direction.x;
    this.operations += 4;
    if (along >= -this.tolerance && Math.abs(across) <= this.tolerance) {
      this.tail = point;
      return this.update(true, false, null);
    }

    // The previous endpoint was already visible. Promoting that exact point to
    // the locked prefix makes the transition immediate without moving history.
    const corner = previousTail;
    let lockedSegment: DrawRigCorridorUpdate["lockedSegment"] = null;
    if (!samePoint(anchor, corner)) {
      lockedSegment = { from: anchor, to: corner };
      this.lockedVertices.push(corner);
    }
    this.anchor = corner;
    this.tail = point;
    const nextX = point.x - corner.x;
    const nextY = point.y - corner.y;
    const nextDistance = Math.hypot(nextX, nextY);
    this.direction = nextDistance >= this.directionSettleDistance
      ? { x: nextX / nextDistance, y: nextY / nextDistance }
      : null;
    this.operations += 4;
    return this.update(true, false, lockedSegment);
  }

  seal(): void {
    this.terminal = true;
  }

  cancel(): void {
    this.terminal = true;
    this.lockedVertices.length = 0;
    this.anchor = null;
    this.tail = null;
    this.lastAccepted = null;
    this.direction = null;
  }

  getLockedVertices(): readonly DrawRigPoint[] {
    return this.lockedVertices;
  }

  getTail(): DrawRigPoint | null {
    return this.tail;
  }

  getAcceptedSampleCount(): number {
    return this.acceptedSamples;
  }

  getWorkUnits(): number {
    return this.operations;
  }

  /** Constant-size working state, excluding the output vertices themselves. */
  getLiveStateSlots(): number {
    return 5;
  }

  getVertices(): DrawRigPoint[] {
    if (!this.tail) return [];
    const out = this.lockedVertices.map(copyPoint);
    if (!out.length || !samePoint(out[out.length - 1], this.tail)) out.push(copyPoint(this.tail));
    return out;
  }

  private update(
    accepted: boolean,
    started: boolean,
    lockedSegment: DrawRigCorridorUpdate["lockedSegment"],
  ): DrawRigCorridorUpdate {
    return {
      accepted,
      started,
      tail: this.tail,
      lockedSegment,
      acceptedSampleCount: this.acceptedSamples,
      workUnits: this.operations,
    };
  }
}
