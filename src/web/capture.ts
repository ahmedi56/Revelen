// 👁️ THE EYES: opens a website in an isolated browser and writes down what it sees.
//
// What is recorded is what any browser's developer tools would show for one
// visit: each request the page made, its type, its status, its size and timing.
// Everything passes through the cleaner (redact.ts) before it is kept, and every
// connection passes through the checkpoint (egressProxy.ts) before it happens.
//
// The browser is used read-only: it never logs in, never downloads files, gets
// no permissions (camera, location...), runs no service workers, and the page
// may not send requests that change things on the server (POST, PUT, DELETE).

import { startEgressProxy, type BlockedConnection, type EgressProxy } from "./egressProxy.js";
import { checkUrlShape, resolvePublic, type Allowance, type Lookup } from "./policy.js";
import { cleanText, KEPT_REQUEST_HEADERS, KEPT_RESPONSE_HEADERS, keepHeaders, redactText, sanitizeUrl } from "./redact.js";

// Playwright's own types are loaded only when a lab starts, so Revelen's other
// tools keep working on a computer where Playwright is not installed.
type Browser = import("playwright").Browser;
type Page = import("playwright").Page;
type PwRequest = import("playwright").Request;

export const LIMITS = {
  navigationTimeoutMs: 25_000, // how long the first page may take to load
  settleMs: 2_000, // extra time after "load", for requests made a little later
  maxRequests: 300, // more than this are counted, not kept
  maxPreviewChars: 1_500, // the most of a response body that is ever kept
  maxBodyForPreview: 65_536, // bodies bigger than this get no preview at all
  maxConsoleMessages: 20,
  maxActions: 25, // things to click or type into, listed for comparisons
  actionTimeoutMs: 5_000, // how long to look for the element to act on
  afterActionMs: 2_500, // how long to watch for requests after an action
  maxTypedChars: 60,
};

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Something on the page the learner may try in a comparison: a button or link to
// click, or a search box to type into. Found by looking at the page, so its text
// was written by the website and is cleaned like everything else.
export interface PageAction {
  id: string; // "a1", "a2"...
  kind: "click" | "type";
  role: "button" | "link" | "textbox";
  text: string; // what the element says, or its label
  selector: string; // where it is on the page, used to find it again on the next visit
  href: string | null; // for links: where they lead (cleaned)
}

// What happened when one action was performed during a visit.
export interface ActionOutcome {
  performed: boolean;
  problem: string | null; // why it could not be done, when it could not
  firstRequestAfter: number; // requests from this position on started after the action
  urlBefore: string;
  urlAfter: string;
  visibleTextBefore: number; // amount of visible text, a simple sign that the page changed
  visibleTextAfter: number;
}

// One request, as recorded. Every text in it has been cleaned.
export interface CapturedRequest {
  id: string; // "r1", "r2"... in the order the page asked
  url: string;
  host: string;
  method: string;
  resourceType: string; // document, script, stylesheet, image, font, fetch, xhr...
  isMainDocument: boolean;
  status: number | null; // null when no answer came back
  failure: string | null; // why it failed, when it did
  contentType: string | null;
  responseBytes: number | null; // size of the body as it travelled, when known
  startMs: number | null; // when it started, counted from the start of the visit
  durationMs: number | null;
  redirectedFrom: string | null; // the id of the request that redirected to this one
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  preview: string | null; // the beginning of a small text or JSON answer, cleaned
}

export interface CaptureResult {
  requestedUrl: string;
  finalUrl: string | null;
  title: string | null;
  startedAt: string;
  loadMs: number | null;
  navigationError: string | null;
  requests: CapturedRequest[];
  droppedRequests: number; // requests beyond the limit, counted but not kept
  blockedByPolicy: BlockedConnection[]; // connections the checkpoint refused
  blockedMethods: { method: string; url: string }[]; // requests that would have changed something
  consoleErrors: string[];
  actions: PageAction[]; // what may be tried in a comparison
  outcome: ActionOutcome | null; // set when this visit performed an action
}

// The live parts of a lab, closed together when the lab stops.
export interface LiveCapture {
  result: CaptureResult;
  close: () => Promise<void>;
}

export class WebLabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebLabError";
  }
}

async function loadChromium() {
  try {
    const { chromium } = await import("playwright");
    return chromium;
  } catch {
    throw new WebLabError("Web labs need Playwright. In the Revelen folder run: npm install playwright, then: npx playwright install chromium");
  }
}

// What a comparison asks a visit to do, after the page has loaded.
export interface ActionRequest {
  action: PageAction;
  text?: string; // for "type": the words to type, then Enter
}

export async function capture(input: string, options: { allow?: Allowance[]; lookup?: Lookup; act?: ActionRequest } = {}): Promise<LiveCapture> {
  const { allow = [], lookup, act } = options;

  // 1. The address itself, before anything starts.
  const shape = checkUrlShape(input, allow);
  if (!shape.ok) throw new WebLabError(shape.reason);
  const target = shape.url;
  const port = target.port ? Number(target.port) : target.protocol === "https:" ? 443 : 80;
  try {
    await resolvePublic(target.hostname, port, allow, lookup);
  } catch (error) {
    throw new WebLabError(error instanceof Error ? error.message : "That address could not be checked.");
  }

  // 2. The checkpoint, then a fresh browser whose only way out is the checkpoint.
  const chromium = await loadChromium();
  const proxy: EgressProxy = await startEgressProxy({ allow, lookup });
  let browser: Browser | undefined;
  const close = async () => {
    await browser?.close().catch(() => {});
    await proxy.close();
  };

  try {
    browser = await chromium.launch({
      headless: true,
      // "<-loopback>" stops Chromium from skipping the proxy for localhost,
      // so local addresses are checked (and refused) like any other.
      proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "<-loopback>" },
      args: [
        "--disable-quic", // no direct UDP connections around the proxy
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", // WebRTC may not reach the network directly
        "--webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--no-pings",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-extensions",
      ],
    });
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block", // a service worker could make requests we would not see
      permissions: [],
      javaScriptEnabled: true,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      userAgent: undefined,
    });
    // No pop-up windows and no dialog boxes: a new window is closed at once, and
    // alert/confirm/prompt are dismissed, so a page cannot stall or escape the lab.
    const page: Page = await context.newPage();
    context.on("page", (popup) => void (popup !== page && popup.close().catch(() => {}))); // after newPage: never the lab's own page
    page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));

    // Read-only: a request that could change something on the server is stopped here.
    const blockedMethods: CaptureResult["blockedMethods"] = [];
    await page.route("**/*", (route) => {
      const request = route.request();
      if (READ_ONLY_METHODS.has(request.method())) return route.continue();
      if (blockedMethods.length < 50) blockedMethods.push({ method: request.method(), url: sanitizeUrl(request.url()) });
      return route.abort("blockedbyclient");
    });

    // 3. Watch the traffic.
    const started = Date.now();
    const result: CaptureResult = {
      requestedUrl: sanitizeUrl(target.toString()),
      finalUrl: null,
      title: null,
      startedAt: new Date(started).toISOString(),
      loadMs: null,
      navigationError: null,
      requests: [],
      droppedRequests: 0,
      blockedByPolicy: proxy.blocked,
      blockedMethods,
      consoleErrors: [],
      actions: [],
      outcome: null,
    };
    const ids = new Map<PwRequest, CapturedRequest>();
    const pending: Promise<unknown>[] = [];

    page.on("request", (request) => {
      if (result.requests.length >= LIMITS.maxRequests) {
        result.droppedRequests += 1;
        return;
      }
      let host = "";
      try {
        host = new URL(request.url()).hostname;
      } catch {
        // data: and blob: addresses have no host
      }
      const entry: CapturedRequest = {
        id: `r${result.requests.length + 1}`,
        url: sanitizeUrl(request.url()),
        host,
        method: request.method(),
        resourceType: request.resourceType(),
        isMainDocument: request.isNavigationRequest() && request.frame() === page.mainFrame(),
        status: null,
        failure: null,
        contentType: null,
        responseBytes: null,
        startMs: Date.now() - started,
        durationMs: null,
        redirectedFrom: ids.get(request.redirectedFrom() as PwRequest)?.id ?? null,
        requestHeaders: keepHeaders(request.headers(), KEPT_REQUEST_HEADERS),
        responseHeaders: {},
        preview: null,
      };
      ids.set(request, entry);
      result.requests.push(entry);
    });

    page.on("response", (response) => {
      const entry = ids.get(response.request());
      if (!entry) return;
      entry.status = response.status();
      const headers = response.headers();
      entry.responseHeaders = keepHeaders(headers, KEPT_RESPONSE_HEADERS);
      entry.contentType = headers["content-type"] ? cleanText(headers["content-type"], 100) : null;

      // A short preview, only for small text answers (JSON, plain text, HTML).
      const isText = /json|text\/(plain|html)|javascript/i.test(entry.contentType ?? "");
      const size = Number(headers["content-length"] ?? NaN);
      const isRedirect = entry.status >= 300 && entry.status < 400;
      if (isText && !isRedirect && !(size > LIMITS.maxBodyForPreview)) {
        pending.push(
          response
            .body()
            .then((body) => {
              if (body.length > LIMITS.maxBodyForPreview) return;
              entry.preview = cleanText(redactText(body.subarray(0, LIMITS.maxPreviewChars * 2).toString("utf8")), LIMITS.maxPreviewChars);
            })
            .catch(() => {})
        );
      }
    });

    page.on("requestfinished", (request) => {
      const entry = ids.get(request);
      if (!entry) return;
      const timing = request.timing();
      if (timing.responseEnd > 0) entry.durationMs = Math.round(timing.responseEnd);
      pending.push(
        request
          .sizes()
          .then((sizes) => {
            entry.responseBytes = sizes.responseBodySize;
          })
          .catch(() => {})
      );
    });

    page.on("requestfailed", (request) => {
      const entry = ids.get(request);
      if (entry) entry.failure = cleanText(request.failure()?.errorText ?? "failed", 120);
    });

    page.on("console", (message) => {
      if (message.type() === "error" && result.consoleErrors.length < LIMITS.maxConsoleMessages) {
        result.consoleErrors.push(cleanText(redactText(message.text()), 300));
      }
    });

    // 4. Visit, then wait a little for the requests that come after "load".
    try {
      await page.goto(target.toString(), { waitUntil: "load", timeout: LIMITS.navigationTimeoutMs });
      result.loadMs = Date.now() - started;
    } catch (error) {
      result.navigationError = cleanText(error instanceof Error ? error.message.split("\n")[0] : "The page did not load.", 200);
    }
    await page.waitForTimeout(LIMITS.settleMs);
    await Promise.allSettled(pending);

    result.finalUrl = sanitizeUrl(page.url());
    result.title = cleanText(redactText(await page.title().catch(() => "")), 120) || null;
    if (!result.navigationError) result.actions = await findActions(page);

    // 5. For a comparison: do the one action, then watch what follows.
    if (act) result.outcome = await perform(page, act, result, pending);

    return { result, close };
  } catch (error) {
    await close();
    if (error instanceof WebLabError) throw error;
    const text = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|browserType\.launch/i.test(text)) {
      throw new WebLabError("Chromium for web labs is not installed. Run: npx playwright install chromium");
    }
    throw new WebLabError(`The browser could not be started: ${cleanText(text.split("\n")[0], 160)}`);
  }
}

// ---------------------------------------------------------------------------
// Actions: finding what can be tried, and trying one.
// ---------------------------------------------------------------------------

// Runs inside the page: lists visible buttons, links and text boxes, with a path
// to find each one again. Password, e-mail and phone boxes are never listed, and
// neither are buttons that would send a form by POST.
async function findActions(page: Page): Promise<PageAction[]> {
  const found = await page
    .evaluate((max) => {
      const pathTo = (element: Element): string => {
        const parts: string[] = [];
        let node: Element | null = element;
        while (node && node !== document.body && parts.length < 12) {
          if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
            parts.unshift(`#${node.id}`);
            break;
          }
          const tag = node.tagName.toLowerCase();
          const same = node.parentElement ? Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName) : [];
          parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
          node = node.parentElement;
        }
        return parts[0]?.startsWith("#") ? parts.join(" > ") : `body > ${parts.join(" > ")}`;
      };
      const visible = (el: Element) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const items: { kind: string; role: string; text: string; selector: string; href: string | null }[] = [];
      const candidates = document.querySelectorAll("button, [role=button], a[href], input");
      for (const el of Array.from(candidates)) {
        if (items.length >= max || !visible(el)) continue;
        const input = el as HTMLInputElement;
        if (el.tagName === "INPUT") {
          const type = (input.type || "text").toLowerCase();
          if (!["text", "search"].includes(type) || input.disabled || input.readOnly) continue;
          const label = input.labels?.[0]?.textContent || input.getAttribute("aria-label") || input.placeholder || input.name || "text box";
          items.push({ kind: "type", role: "textbox", text: label, selector: pathTo(el), href: null });
          continue;
        }
        if ((el as HTMLButtonElement).disabled) continue;
        const form = el.closest("form");
        const submits = el.tagName === "BUTTON" && ((el as HTMLButtonElement).type || "submit") === "submit";
        if (form && submits && (form.getAttribute("method") || "get").toLowerCase() !== "get") continue;
        if (el.tagName === "A" && (el.hasAttribute("download") || /^(javascript|mailto|tel):/i.test(el.getAttribute("href") || ""))) continue;
        const text = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        items.push({ kind: "click", role: el.tagName === "A" ? "link" : "button", text, selector: pathTo(el), href: el.tagName === "A" ? (el as HTMLAnchorElement).href : null });
      }
      return items;
    }, LIMITS.maxActions)
    .catch(() => []);

  return found.map((item, index) => ({
    id: `a${index + 1}`,
    kind: item.kind === "type" ? "type" : "click",
    role: item.role === "link" ? "link" : item.role === "textbox" ? "textbox" : "button",
    text: cleanText(redactText(item.text), 80),
    selector: item.selector.slice(0, 400),
    href: item.href ? sanitizeUrl(item.href) : null,
  }));
}

const visibleText = (page: Page) => page.evaluate(() => document.body?.innerText.length ?? 0).catch(() => 0);

async function perform(page: Page, act: ActionRequest, result: CaptureResult, pending: Promise<unknown>[]): Promise<ActionOutcome> {
  const outcome: ActionOutcome = {
    performed: false,
    problem: null,
    firstRequestAfter: result.requests.length,
    urlBefore: sanitizeUrl(page.url()),
    urlAfter: sanitizeUrl(page.url()),
    visibleTextBefore: await visibleText(page),
    visibleTextAfter: 0,
  };
  try {
    const element = page.locator(act.action.selector).first();
    await element.waitFor({ state: "visible", timeout: LIMITS.actionTimeoutMs });
    // The element must still say what it said on the first visit; otherwise the page changed.
    const now = cleanText(redactText(((await element.textContent()) || (await element.getAttribute("aria-label")) || (await element.getAttribute("placeholder")) || "").replace(/\s+/g, " ").trim()), 80);
    if (act.action.kind === "click" && now !== act.action.text) {
      throw new WebLabError(`The page changed since the first visit: that element now says "${now}".`);
    }
    outcome.firstRequestAfter = result.requests.length;
    if (act.action.kind === "type") {
      await element.fill((act.text ?? "").slice(0, LIMITS.maxTypedChars), { timeout: LIMITS.actionTimeoutMs });
      await element.press("Enter", { timeout: LIMITS.actionTimeoutMs });
    } else {
      await element.click({ timeout: LIMITS.actionTimeoutMs });
    }
    outcome.performed = true;
  } catch (error) {
    outcome.problem = error instanceof WebLabError ? error.message : "The element could not be found or used on this visit.";
  }
  await page.waitForTimeout(LIMITS.afterActionMs);
  await Promise.allSettled(pending);
  outcome.urlAfter = sanitizeUrl(page.url());
  outcome.visibleTextAfter = await visibleText(page);
  return outcome;
}
