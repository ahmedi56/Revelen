// 🔎 THE EVIDENCE BOARD: turns what the browser saw into numbered pieces of evidence,
// each labelled with how sure we can be about it.
//
//   observed        something the browser recorded directly
//   interpretation  a conclusion that follows from several observations
//   hypothesis      a likely explanation that still needs testing
//   unknown         something this visit cannot tell us
//
// The labels are the point. A tutor that mixes "we saw this" with "we guess this"
// teaches bad habits. Every interpretation lists the evidence it rests on.

import type { CaptureResult, CapturedRequest } from "./capture.js";

export type Certainty = "observed" | "interpretation" | "hypothesis" | "unknown";

export interface Evidence {
  id: string; // "E1", "E2"...
  certainty: Certainty;
  kind: "request" | "redirect" | "blocked" | "console" | "summary";
  summary: string; // one plain sentence
  requestIds: string[]; // the requests this is about
  basedOn: string[]; // for interpretations and hypotheses: the evidence they rest on
  limitations: string[]; // what this piece of evidence cannot tell us
}

const SOURCE_LIMITS = "Seen from one visit in an automated Chromium browser. Another visit, browser or country can differ.";

// The request that carried the page itself: the main document that got a real answer.
export function mainDocument(capture: CaptureResult): CapturedRequest | undefined {
  const documents = capture.requests.filter((r) => r.isMainDocument);
  return documents.find((r) => r.status !== null && (r.status < 300 || r.status >= 400)) ?? documents[documents.length - 1];
}

export function describeSize(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}

export function buildEvidence(capture: CaptureResult): Evidence[] {
  const evidence: Evidence[] = [];
  const add = (item: Omit<Evidence, "id">) => {
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, ...item });
    return id;
  };

  // ----- observed: one piece per request -----
  const byRequest = new Map<string, string>();
  for (const r of capture.requests) {
    const answer = r.failure ? `failed (${r.failure})` : r.status === null ? "got no answer" : `answered ${r.status}`;
    const id = add({
      certainty: "observed",
      kind: "request",
      summary: `${r.id}: ${r.method} ${r.resourceType} request to ${r.host || "the page itself"}, ${answer}${r.contentType ? `, type ${r.contentType}` : ""}.`,
      requestIds: [r.id],
      basedOn: [],
      limitations: ["Which part of the page started this request is not recorded."],
    });
    byRequest.set(r.id, id);
  }

  // ----- observed: redirects -----
  for (const r of capture.requests.filter((x) => x.redirectedFrom)) {
    add({
      certainty: "observed",
      kind: "redirect",
      summary: `${r.redirectedFrom} was redirected, and the browser followed it with ${r.id}.`,
      requestIds: [r.redirectedFrom!, r.id],
      basedOn: [byRequest.get(r.redirectedFrom!)!, byRequest.get(r.id)!].filter(Boolean),
      limitations: [],
    });
  }

  // ----- observed: what the checkpoint and the read-only rule refused -----
  for (const b of capture.blockedByPolicy) {
    add({
      certainty: "observed",
      kind: "blocked",
      summary: `The page tried to reach ${b.host}:${b.port}. Revelen refused: ${b.reason}`,
      requestIds: [],
      basedOn: [],
      limitations: ["Refused connections never happened, so their answers are unknown."],
    });
  }
  for (const m of capture.blockedMethods) {
    add({
      certainty: "observed",
      kind: "blocked",
      summary: `The page tried to send a ${m.method} request to ${m.url}. Revelen stopped it, because web labs never change anything on a website.`,
      requestIds: [],
      basedOn: [],
      limitations: [],
    });
  }
  if (capture.consoleErrors.length > 0) {
    add({
      certainty: "observed",
      kind: "console",
      summary: `The page's own scripts reported ${capture.consoleErrors.length} error(s) in the browser console.`,
      requestIds: [],
      basedOn: [],
      limitations: ["Console messages are written by the website and are shown only as data."],
    });
  }

  // ----- interpretations: conclusions resting on several observations -----
  const main = mainDocument(capture);
  if (main && main.status !== null && main.status < 300 && /html/i.test(main.contentType ?? "")) {
    add({
      certainty: "interpretation",
      kind: "summary",
      summary: `The page's HTML arrived in ${main.id}: it is the main document, it succeeded, and its type is HTML.`,
      requestIds: [main.id],
      basedOn: [byRequest.get(main.id)!],
      limitations: ["The HTML is what the server sent; scripts may have changed the page afterwards."],
    });
  }
  const hosts = [...new Set(capture.requests.map((r) => r.host).filter(Boolean))];
  if (hosts.length > 0) {
    add({
      certainty: "interpretation",
      kind: "summary",
      summary: `During this visit the browser contacted ${hosts.length} different host(s): ${hosts.slice(0, 6).join(", ")}${hosts.length > 6 ? "..." : ""}.`,
      requestIds: capture.requests.slice(0, 50).map((r) => r.id),
      basedOn: [...byRequest.values()].slice(0, 50),
      limitations: ["Only requests made during this visit are counted. Others may happen later or after a click."],
    });
  }

  // ----- hypotheses: plausible, but not shown by this evidence alone -----
  const dataRequests = capture.requests.filter((r) => (r.resourceType === "fetch" || r.resourceType === "xhr") && /json/i.test(r.contentType ?? ""));
  if (dataRequests.length > 0) {
    add({
      certainty: "hypothesis",
      kind: "summary",
      summary: `${dataRequests.map((r) => r.id).slice(0, 8).join(", ")} returned JSON to the page's scripts. They are probably data the page displays, but this visit does not show which script used them, or how.`,
      requestIds: dataRequests.map((r) => r.id),
      basedOn: dataRequests.map((r) => byRequest.get(r.id)!).filter(Boolean),
      limitations: ["To test it: perform an action on the page and see whether the same kind of request appears, or read the script that made it."],
    });
  }

  // ----- unknowns: stated plainly, so nobody fills the gap with a guess -----
  add({
    certainty: "unknown",
    kind: "summary",
    summary: "What happens on the website's servers (their code, their database, who else they talk to) cannot be seen from a browser.",
    requestIds: [],
    basedOn: [],
    limitations: [SOURCE_LIMITS],
  });
  if (capture.droppedRequests > 0) {
    add({
      certainty: "unknown",
      kind: "summary",
      summary: `${capture.droppedRequests} more request(s) happened but were not kept, to stay within the lab's limits.`,
      requestIds: [],
      basedOn: [],
      limitations: [],
    });
  }

  return evidence;
}

// One short line per request, for the timeline.
export function timelineLine(r: CapturedRequest): string {
  const answer = r.failure ? `FAILED (${r.failure})` : String(r.status ?? "-");
  const time = r.durationMs !== null ? `${r.durationMs} ms` : "";
  const via = r.redirectedFrom ? ` (after redirect from ${r.redirectedFrom})` : "";
  return `${r.id.padEnd(4)} ${r.method.padEnd(4)} ${answer.padEnd(4)} ${r.resourceType.padEnd(10)} ${r.url}  ${describeSize(r.responseBytes)} ${time}${via}${r.isMainDocument ? "  <- main document" : ""}`;
}
