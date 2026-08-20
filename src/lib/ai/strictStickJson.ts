export const STICK_AI_REQUEST_BYTE_LIMIT = 16_384 as const;

export const STICK_JSON_MARKER_PATHS = [
  "$.kind",
  "$.workspaceType",
  "$.projectContext.kind",
  "$.projectContext.workspaceType",
  "$.capabilityManifest.capabilities[]",
] as const;

export type StickJsonMarkerPath = (typeof STICK_JSON_MARKER_PATHS)[number];

export type StickJsonMarkerEvidence = {
  path: StickJsonMarkerPath;
};

export type StrictStickJsonErrorCode =
  | "invalid_utf8"
  | "utf8_bom"
  | "invalid_json"
  | "duplicate_key"
  | "non_object_root";

type StrictStickJsonBase = {
  rawBytes: Uint8Array;
  rawUtf8ByteLength: number;
  markers: StickJsonMarkerEvidence[];
};

export type StrictStickJsonResult =
  | (StrictStickJsonBase & {
      ok: true;
      rawText: string;
      parsedValue: Record<string, unknown>;
    })
  | (StrictStickJsonBase & {
      ok: false;
      rawText?: string;
      error: {code: StrictStickJsonErrorCode; path: string};
    });

class StrictJsonSyntaxError extends Error {
  readonly path: string;

  constructor(path: string) {
    super("Strict JSON syntax error.");
    this.path = path;
  }
}

type JsonPathPart = string | number;

const jsonPath = (parts: readonly JsonPathPart[]) =>
  parts.reduce<string>((path, part) =>
    typeof part === "number" ? `${path}[${part}]` : `${path}.${part}`, "$",
  );

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

class StrictJsonParser {
  private index = 0;
  private duplicatePath: string | null = null;
  private readonly markerPaths = new Set<StickJsonMarkerPath>();
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): {
    value?: Record<string, unknown>;
    markers: StickJsonMarkerEvidence[];
    error?: {code: "invalid_json" | "duplicate_key" | "non_object_root"; path: string};
  } {
    let value: unknown;
    try {
      this.skipWhitespace();
      value = this.parseValue([]);
      this.skipWhitespace();
      if (this.index !== this.source.length) throw new StrictJsonSyntaxError("$");
    } catch (error) {
      if (!(error instanceof StrictJsonSyntaxError)) throw error;
      return {
        markers: this.markers(),
        error: this.duplicatePath
          ? {code: "duplicate_key", path: this.duplicatePath}
          : {code: "invalid_json", path: error.path},
      };
    }

    if (this.duplicatePath) {
      return {
        markers: this.markers(),
        error: {code: "duplicate_key", path: this.duplicatePath},
      };
    }
    if (!isObjectRecord(value)) {
      return {
        markers: this.markers(),
        error: {code: "non_object_root", path: "$"},
      };
    }
    return {value, markers: this.markers()};
  }

  private markers(): StickJsonMarkerEvidence[] {
    return STICK_JSON_MARKER_PATHS
      .filter((path) => this.markerPaths.has(path))
      .map((path) => ({path}));
  }

  private skipWhitespace() {
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break;
      this.index += 1;
    }
  }

  private parseValue(path: readonly JsonPathPart[]): unknown {
    const character = this.source[this.index];
    let value: unknown;
    if (character === "{") value = this.parseObject(path);
    else if (character === "[") value = this.parseArray(path);
    else if (character === '"') value = this.parseString(path);
    else if (character === "t") value = this.parseLiteral("true", true, path);
    else if (character === "f") value = this.parseLiteral("false", false, path);
    else if (character === "n") value = this.parseLiteral("null", null, path);
    else if (character === "-" || (character !== undefined && character >= "0" && character <= "9")) {
      value = this.parseNumber(path);
    } else throw new StrictJsonSyntaxError(jsonPath(path));
    this.recordMarker(path, value);
    return value;
  }

  private parseObject(path: readonly JsonPathPart[]) {
    const result = Object.create(null) as Record<string, unknown>;
    const seen = new Set<string>();
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return result;
    }
    for (;;) {
      if (this.source[this.index] !== '"') throw new StrictJsonSyntaxError(jsonPath(path));
      const key = this.parseString(path);
      const memberPath = [...path, key];
      if (seen.has(key) && this.duplicatePath === null) this.duplicatePath = jsonPath(memberPath);
      seen.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") throw new StrictJsonSyntaxError(jsonPath(memberPath));
      this.index += 1;
      this.skipWhitespace();
      const value = this.parseValue(memberPath);
      if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return result;
      }
      if (this.source[this.index] !== ",") throw new StrictJsonSyntaxError(jsonPath(path));
      this.index += 1;
      this.skipWhitespace();
    }
  }

  private parseArray(path: readonly JsonPathPart[]) {
    const result: unknown[] = [];
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return result;
    }
    for (let itemIndex = 0; ; itemIndex += 1) {
      result.push(this.parseValue([...path, itemIndex]));
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return result;
      }
      if (this.source[this.index] !== ",") throw new StrictJsonSyntaxError(jsonPath(path));
      this.index += 1;
      this.skipWhitespace();
    }
  }

  private parseString(path: readonly JsonPathPart[]) {
    let value = "";
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      const code = this.source.charCodeAt(this.index);
      if (character === '"') {
        this.index += 1;
        return value;
      }
      if (code < 0x20) throw new StrictJsonSyntaxError(jsonPath(path));
      if (character !== "\\") {
        value += character;
        this.index += 1;
        continue;
      }
      this.index += 1;
      const escape = this.source[this.index];
      const simpleEscapes: Record<string, string> = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (escape !== undefined && Object.prototype.hasOwnProperty.call(simpleEscapes, escape)) {
        value += simpleEscapes[escape];
        this.index += 1;
        continue;
      }
      if (escape !== "u") throw new StrictJsonSyntaxError(jsonPath(path));
      const hex = this.source.slice(this.index + 1, this.index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new StrictJsonSyntaxError(jsonPath(path));
      value += String.fromCharCode(Number.parseInt(hex, 16));
      this.index += 5;
    }
    throw new StrictJsonSyntaxError(jsonPath(path));
  }

  private parseLiteral<T extends boolean | null>(token: string, value: T, path: readonly JsonPathPart[]): T {
    if (this.source.slice(this.index, this.index + token.length) !== token) {
      throw new StrictJsonSyntaxError(jsonPath(path));
    }
    this.index += token.length;
    return value;
  }

  private parseNumber(path: readonly JsonPathPart[]) {
    const remainder = this.source.slice(this.index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(remainder);
    if (!match) throw new StrictJsonSyntaxError(jsonPath(path));
    const token = match[0];
    const value = Number(token);
    if (!Number.isFinite(value)) throw new StrictJsonSyntaxError(jsonPath(path));
    this.index += token.length;
    return value;
  }

  private recordMarker(path: readonly JsonPathPart[], value: unknown) {
    const add = (markerPath: StickJsonMarkerPath) => this.markerPaths.add(markerPath);
    if (path.length === 1 && path[0] === "kind" && value === "stick-ai-request") add("$.kind");
    if (path.length === 1 && path[0] === "workspaceType" && value === "stick-figure") add("$.workspaceType");
    if (path.length === 2 && path[0] === "projectContext" && path[1] === "kind" && value === "stick-project-context") {
      add("$.projectContext.kind");
    }
    if (path.length === 2 && path[0] === "projectContext" && path[1] === "workspaceType" && value === "stick-figure") {
      add("$.projectContext.workspaceType");
    }
    if (
      path.length === 3 &&
      path[0] === "capabilityManifest" &&
      path[1] === "capabilities" &&
      typeof path[2] === "number" &&
      value === "stick.pose-sequence.create/v1"
    ) add("$.capabilityManifest.capabilities[]");
  }
}

export const parseStrictStickJsonBytes = (rawBytesInput: Uint8Array): StrictStickJsonResult => {
  const rawBytes = new Uint8Array(rawBytesInput);
  const rawUtf8ByteLength = rawBytes.byteLength;
  if (rawBytes.length >= 3 && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) {
    return {ok: false, rawBytes, rawUtf8ByteLength, markers: [], error: {code: "utf8_bom", path: "$"}};
  }
  let rawText: string;
  try {
    rawText = new TextDecoder("utf-8", {fatal: true}).decode(rawBytes);
  } catch {
    return {ok: false, rawBytes, rawUtf8ByteLength, markers: [], error: {code: "invalid_utf8", path: "$"}};
  }
  const parsed = new StrictJsonParser(rawText).parse();
  if (parsed.error) {
    return {ok: false, rawBytes, rawUtf8ByteLength, rawText, markers: parsed.markers, error: parsed.error};
  }
  return {ok: true, rawBytes, rawUtf8ByteLength, rawText, parsedValue: parsed.value!, markers: parsed.markers};
};

export const readStrictStickJson = async (request: Request): Promise<StrictStickJsonResult> =>
  parseStrictStickJsonBytes(new Uint8Array(await request.arrayBuffer()));
