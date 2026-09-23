import { AssistantError, normalizeText, type AssistantRequest } from "./assistantContracts.ts";

export type SearchDecision =
  | { mode: "local"; topic: null; publicQuery: null }
  | { mode: "required"; topic: string; publicQuery: string };

const GREETING = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|who are you|what can you do)[\s?!.,]*$/i;
const INTERNAL = /\b(?:diamond animator|assistant|ai animator|finalizer|new project|open project|my projects|tutorials?|save(?: as| and exit)?|recover(?:y| work)?|export|timeline|onion skin|draw rig|layers?|assets?|library|brush|eraser|keyframes?|workspace)\b/i;
const INTERNAL_QUESTION = /\b(?:where|how|what|which|can|does|is|are)\b[\s\S]{0,80}\b(?:export|save|open|draw|animate|recover|project|assistant|animator|timeline|onion|layer|asset|tutorial|finalizer)\b/i;
const STABLE_ANIMATION = /\b(?:animation principles?|squash and stretch|anticipation|staging|follow through|overlapping action|pose to pose|straight ahead|arcs?|timing and spacing|ease in|ease out|keyframe|onion skin)\b/i;
const EXTERNAL_SUBJECT = /\b(?:youtube(?: shorts?)?|tiktok|instagram|facebook|snapchat|discord|reddit|twitter|\bx\b|linkedin|chrome|firefox|safari|edge|openai|responses api|html|css|web standard|codec|mp4|h\.264|social (?:media|platform)|browser)\b/i;
const FRESHNESS = /\b(?:as of (?:today|now)|today|currently?|latest|newest|recent|this (?:week|month|year)|maximum|minimum|recommended|requirements?|specifications?|limits?|pricing|price|rate limits?|supported|version|release|policy|rules?|law|schedule|deadline|202[4-9])\b/i;
const EXPLICIT_WEB = /\b(?:search|browse|look (?:it )?up|check online|on the web|internet)\b/i;
const PRIVATE_DATA = /(?:\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b|(?:^|\s)(?:\/Users\/|[A-Za-z]:\\)|\b(?:api[_ -]?key|password|secret|access[_ -]?token|private project)\b)/i;

function compactPublicQuery(message: string) {
  const withoutUrls = message.replace(/https?:\/\/\S+/gi, match => {
    try { return new URL(match).hostname; } catch { return "public link"; }
  });
  const compact = normalizeText(withoutUrls).replace(/\s+/g, " ");
  if (compact.length <= 512) return compact;
  const cut = compact.slice(0, 512);
  return cut.replace(/\s+\S*$/, "").trim();
}

function topicFor(message: string) {
  const platforms = [
    [/\byoutube shorts?\b/i, "YouTube Shorts"], [/\byoutube\b/i, "YouTube"], [/\btiktok\b/i, "TikTok"],
    [/\binstagram\b/i, "Instagram"], [/\bfacebook\b/i, "Facebook"], [/\breddit\b/i, "Reddit"],
    [/\bsnapchat\b/i, "Snapchat"], [/\bdiscord\b/i, "Discord"], [/\blinkedin\b/i, "LinkedIn"], [/\b(?:twitter|\bx\b)\b/i, "X"],
  ].filter(([pattern]) => (pattern as RegExp).test(message)).map(([, name]) => name as string);
  if (platforms[0] === "YouTube Shorts") { const youtube = platforms.indexOf("YouTube", 1); if (youtube >= 0) platforms.splice(youtube, 1); }
  if (platforms.length === 1) return `current ${platforms[0]} requirements`;
  if (platforms.length > 1) return `current ${platforms.slice(0, -1).join(", ")}, and ${platforms.at(-1)} information`;
  if (/\b(?:chrome|firefox|safari|edge|browser)\b/i.test(message)) return "current browser requirements";
  if (/\b(?:openai|responses api)\b/i.test(message)) return "current public API information";
  return "current public information";
}

export function decideAssistantSearch(request: Pick<AssistantRequest, "message">): SearchDecision {
  const message = normalizeText(request.message);
  if (GREETING.test(message)) return { mode: "local", topic: null, publicQuery: null };
  const external = EXTERNAL_SUBJECT.test(message);
  const freshness = FRESHNESS.test(message);
  const explicit = EXPLICIT_WEB.test(message);
  const internal = INTERNAL.test(message) || INTERNAL_QUESTION.test(message);
  const stable = STABLE_ANIMATION.test(message) && !external && !freshness && !explicit;
  const asksAboutAssistantSearch = /\b(?:can|do|does|will)\b[\s\S]{0,30}\b(?:you|assistant)\b[\s\S]{0,30}\b(?:search|browse|internet|web)\b/i.test(message);
  if (asksAboutAssistantSearch || stable || (internal && !external && !freshness && !explicit)) return { mode: "local", topic: null, publicQuery: null };
  if (!(explicit || freshness || external || /https?:\/\//i.test(message))) return { mode: "local", topic: null, publicQuery: null };
  if (PRIVATE_DATA.test(message)) throw new AssistantError("privacy", "Current public information can be checked, but private or local data cannot be sent to web search. Remove it and try again.");
  const publicQuery = compactPublicQuery(message);
  if (!publicQuery) throw new AssistantError("privacy", "Enter a public question without private or local data.");
  return { mode: "required", topic: topicFor(message), publicQuery };
}
