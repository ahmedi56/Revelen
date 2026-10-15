// 🧽 THE CLEANER: removes secrets before anything is kept, shown or sent to an AI.
//
// Websites put private things in their traffic: session cookies, login tokens,
// API keys, e-mail addresses. A learning tool has no use for them, and keeping
// them would be a risk. So captured values are cleaned on the way in, and only
// a short list of harmless headers is kept at all.

const REDACTED = "[removed]";

// Query parameters whose NAME suggests a secret.
const SECRET_NAME = /(token|key|secret|auth|session|sess|sid|password|passwd|pwd|pass|code|signature|sig|credential|jwt|bearer|access|refresh|otp|nonce|state|email|mail|phone|user|login|account)/i;

// Values that look like secrets whatever their name: long random-looking strings, and JWTs.
const LOOKS_LIKE_TOKEN = /^[A-Za-z0-9_\-+/=.%]{24,}$/;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const LONG_TOKEN = /[A-Za-z0-9_\-+/]{32,}={0,2}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_FIELD = /("(?:[^"]*(?:token|secret|password|passwd|apikey|api_key|key|session|auth|cookie|email)[^"]*)"\s*:\s*)"[^"]*"/gi;

// Only these headers are kept. Everything else (cookies, authorization, custom
// tokens) is dropped without being stored anywhere.
export const KEPT_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-encoding",
  "cache-control",
  "age",
  "etag",
  "last-modified",
  "server",
  "x-powered-by",
  "via",
  "x-cache",
  "cf-cache-status",
  "access-control-allow-origin",
  "location",
];
export const KEPT_REQUEST_HEADERS = ["accept", "content-type", "referer", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"];

// Remove control characters (they can hide text or confuse a terminal), and cut to a length.
export function cleanText(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const plain = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "");
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export function redactText(text: string): string {
  return text.replace(JWT, REDACTED).replace(SECRET_FIELD, `$1"${REDACTED}"`).replace(EMAIL, "[e-mail removed]").replace(LONG_TOKEN, REDACTED);
}

// An address, cleaned: no user name or password, no #fragment, and no secret-looking query values.
export function sanitizeUrl(raw: string, max = 300): string {
  if (raw.startsWith("data:")) return `data:… (${raw.length} characters, embedded in the page)`;
  if (raw.startsWith("blob:")) return "blob:… (made by the page's own script)";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return cleanText(redactText(raw), max);
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const [name, value] of [...url.searchParams]) {
    if (SECRET_NAME.test(name) || LOOKS_LIKE_TOKEN.test(value)) url.searchParams.set(name, REDACTED);
  }
  // Long path parts can carry tokens too (for example /reset/abcdef...).
  url.pathname = url.pathname
    .split("/")
    .map((part) => (LOOKS_LIKE_TOKEN.test(part) && part.length >= 32 ? REDACTED : part))
    .join("/");
  let shown = url.toString().replace(/%5Bremoved%5D/gi, REDACTED);
  try {
    shown = decodeURIComponent(shown); // easier to read: "café" instead of "caf%C3%A9"
  } catch {
    // a broken %-sequence: keep the encoded form
  }
  return cleanText(shown, max);
}

// Keep only harmless headers, with their values cleaned.
export function keepHeaders(headers: Record<string, string>, kept: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of kept) {
    const value = headers[name];
    if (value === undefined) continue;
    out[name] = name === "referer" || name === "location" ? sanitizeUrl(value) : cleanText(redactText(value), 200);
  }
  return out;
}
