import { AssistantError, normalizeText, type AssistantRequest } from "./assistantContracts.ts";

// The model decides when outside/public facts are needed: every non-greeting turn
// is offered hosted web search with tool_choice "auto". The only gate left is
// privacy: private or local data in the user's words never reaches search.
export type SearchDecision =
  | { mode: "local"; topic: null; publicQuery: null }
  | { mode: "auto"; topic: string; publicQuery: string };

const GREETING = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|who are you|what can you do)[\s?!.,]*$/i;
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
  if (platforms.length === 1) return `${platforms[0]} for information`;
  if (platforms.length > 1) return `${platforms.slice(0, -1).join(", ")} and ${platforms.at(-1)} for information`;
  if (/\b(?:chrome|firefox|safari|edge|browser)\b/i.test(message)) return "current browser information";
  if (/\b(?:openai|responses api)\b/i.test(message)) return "current public API information";
  return "public websites for current information";
}

export function decideAssistantSearch(request: Pick<AssistantRequest, "message"> & Partial<Pick<AssistantRequest, "recentConversation">>): SearchDecision {
  const message = normalizeText(request.message);
  if (GREETING.test(message)) return { mode: "local", topic: null, publicQuery: null };
  // Follow-ups ("what does he look like?") lean on earlier turns, so the user's
  // recent words are privacy-checked too. Assistant replies are app text, not user data.
  const userContext = (request.recentConversation ?? []).filter(m => m.role === "user").map(m => m.text);
  if ([message, ...userContext].some(text => PRIVATE_DATA.test(text))) return { mode: "local", topic: null, publicQuery: null };
  const publicQuery = compactPublicQuery(message);
  if (!publicQuery) throw new AssistantError("privacy", "Enter a public question without private or local data.");
  return { mode: "auto", topic: topicFor(message), publicQuery };
}
