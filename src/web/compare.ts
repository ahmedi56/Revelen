// ⚖️ BEFORE AND AFTER: what changed when the learner did one thing on the page.
//
// A comparison repeats the visit, performs ONE action from the page's list
// (click a button or link, or type into a search box and press Enter), and
// splits the requests into those that came before the action and those that
// came after. The second group is the interesting one, with a warning: a
// request that came after an action did not necessarily come FROM it. Pages
// also make requests on timers. The evidence says so.

import { LIMITS, type ActionOutcome, type CapturedRequest, type PageAction } from "./capture.js";
import type { Evidence } from "./evidence.js";
import type { LessonState } from "./lesson.js";

export const MAX_COMPARISONS = 5; // per lab: the newest are kept

export interface Comparison {
  id: string; // "c1", "c2"...
  at: string;
  action: PageAction;
  typed: string | null;
  outcome: ActionOutcome;
  before: CapturedRequest[];
  after: CapturedRequest[];
}

// Two requests are "the same" when their method, type and cleaned address match.
const sameKey = (r: CapturedRequest) => `${r.method} ${r.resourceType} ${r.url}`;

export function newRequests(c: Comparison): CapturedRequest[] {
  const seen = new Set(c.before.map(sameKey));
  return c.after.filter((r) => !seen.has(sameKey(r)));
}

export const describeAction = (c: Comparison) =>
  c.action.kind === "type" ? `typing "${c.typed ?? ""}" into "${c.action.text}" and pressing Enter` : `clicking the ${c.action.role} "${c.action.text}"`;

// The request that brought new content after the action, or null when none did.
export function dataRequest(c: Comparison): CapturedRequest | null {
  return (
    newRequests(c).find(
      (r) => ["fetch", "xhr", "document"].includes(r.resourceType) && r.status !== null && r.status >= 200 && r.status < 300
    ) ?? null
  );
}

export const textChanged = (o: ActionOutcome) => o.visibleTextBefore !== o.visibleTextAfter;

// The comparison as labelled evidence, numbered after the lab's own evidence.
export function comparisonEvidence(c: Comparison, firstNumber: number): Evidence[] {
  const out: Evidence[] = [];
  const add = (item: Omit<Evidence, "id">) => out.push({ id: `E${firstNumber + out.length}`, ...item });
  const action = describeAction(c);

  if (!c.outcome.performed) {
    add({ certainty: "observed", kind: "summary", summary: `${c.id}: the action (${action}) could not be done: ${c.outcome.problem}`, requestIds: [], basedOn: [], limitations: [] });
    return out;
  }
  const fresh = newRequests(c);
  add({
    certainty: "observed",
    kind: "summary",
    summary: `${c.id}: after ${action}, ${c.after.length} request(s) started within ${LIMITS.afterActionMs / 1000} seconds; ${fresh.length} of them did not happen before the action.`,
    requestIds: c.after.map((r) => r.id),
    basedOn: [],
    limitations: ["The window is short: requests that start later are missed."],
  });
  add({
    certainty: "observed",
    kind: "summary",
    summary: textChanged(c.outcome)
      ? `${c.id}: the amount of visible text changed, from ${c.outcome.visibleTextBefore} to ${c.outcome.visibleTextAfter} characters.`
      : `${c.id}: the amount of visible text did not change.`,
    requestIds: [],
    basedOn: [],
    limitations: ["Counting characters is a rough sign: a change of the same length would not show."],
  });
  if (c.outcome.urlBefore !== c.outcome.urlAfter) {
    add({ certainty: "observed", kind: "summary", summary: `${c.id}: the address changed, from ${c.outcome.urlBefore} to ${c.outcome.urlAfter}.`, requestIds: [], basedOn: [], limitations: [] });
  }

  const data = dataRequest(c);
  const observed = out.map((e) => e.id);
  if (data && textChanged(c.outcome)) {
    add({
      certainty: "interpretation",
      kind: "summary",
      summary: `${action} most likely caused ${data.id}: it is new, it started right after the action, it brought ${data.contentType ?? "content"}, and the visible text changed.`,
      requestIds: [data.id],
      basedOn: observed,
      limitations: ["Timing and a page change together make it likely, not certain. Reading the page's script would confirm it."],
    });
  } else if (data) {
    add({
      certainty: "hypothesis",
      kind: "summary",
      summary: `${data.id} is new after the action, but the visible text did not change. It may have been caused by the action, or by a timer.`,
      requestIds: [data.id],
      basedOn: observed,
      limitations: ["To test it: repeat the comparison and see whether the same request comes back."],
    });
  } else if (textChanged(c.outcome)) {
    add({
      certainty: "interpretation",
      kind: "summary",
      summary: "The page changed without asking the server for anything new: the change was made by the page's own JavaScript, with data it already had.",
      requestIds: [],
      basedOn: observed,
      limitations: [],
    });
  }
  add({
    certainty: "unknown",
    kind: "summary",
    summary: `${c.id}: whether EVERY request after the action came from it. Pages also make requests on timers, and this lab does not record which script started a request.`,
    requestIds: [],
    basedOn: [],
    limitations: [],
  });
  return out;
}

// ---------------------------------------------------------------------------
// The second lesson: "What did your action ask for?"
// ---------------------------------------------------------------------------

export const LESSON2_ID = "web-2-action-effect";

export const QUESTION2 =
  "THE QUESTION: look at the requests that came after the action. Which one brought the new content? Answer with its number, or say 'none' if the page changed without asking the server.";

const rightAnswer = (c: Comparison) => dataRequest(c)?.id ?? "none";

export function explainComparison(c: Comparison): string {
  if (!c.outcome.performed) return `The action could not be done: ${c.outcome.problem} Try another one from the list.`;
  return (
    "THE OBSERVATION: some pages fetch new content from the server when you act (that request shows up after the action). " +
    "Others already have everything and only rearrange the page with JavaScript (then no new request is needed). " +
    `Here, after ${describeAction(c)}, ${newRequests(c).length} new request(s) appeared, and the visible text ${textChanged(c.outcome) ? "changed" : "did not change"}.`
  );
}

export function nextHint2(c: Comparison, state: LessonState): { text: string; state: LessonState } {
  const answer = rightAnswer(c);
  const hints = [
    "Hint 1: ignore the requests marked 'seen before': they would have happened anyway. Look only at the new ones.",
    "Hint 2: content usually arrives as data (type fetch or xhr, often JSON) or as a whole new page (type document), with a status in the 200s.",
    answer === "none"
      ? "Hint 3 (the answer): none. No new request brought content, yet the page changed: its own JavaScript did the work."
      : `Hint 3 (the answer): ${answer}. It is new, it brought content, and it came right after the action.`,
  ];
  const index = Math.min(state.hintsUsed, hints.length - 1);
  return { text: hints[index], state: { ...state, hintsUsed: Math.min(state.hintsUsed + 1, hints.length) } };
}

export function checkAnswer2(c: Comparison, state: LessonState, answer: string): { correct: boolean; text: string; state: LessonState } {
  const attempts = state.attempts + 1;
  const given = /none|nothing|no request|aucun/i.test(answer) ? "none" : (/r?\s*(\d+)/i.exec(answer)?.[1] ? `r${/r?\s*(\d+)/i.exec(answer)![1]}` : answer.trim());
  const right = rightAnswer(c);
  if (given === right) {
    return {
      correct: true,
      text:
        right === "none"
          ? "Correct: no request was needed. The page changed using what it already had. That is why a page can feel instant: nothing travelled over the network."
          : `Correct: ${right} brought the new content. You found it by comparing before and after, which is how investigators tell cause from coincidence.`,
      state: { ...state, attempts, solved: true, solvedAt: state.solvedAt ?? new Date().toISOString() },
    };
  }
  const picked = c.after.find((r) => r.id === given) ?? c.before.find((r) => r.id === given);
  let why = given === "none" ? "Actually, one new request did bring content after the action." : `There is no request ${given} in this comparison.`;
  if (picked && c.before.includes(picked)) why = `${picked.id} happened before the action, so it cannot be its result.`;
  else if (picked && !newRequests(c).includes(picked)) why = `${picked.id} came after the action, but the same request also happened before it.`;
  else if (picked) why = `${picked.id} is new, but it is a ${picked.resourceType}${picked.status ? ` that answered ${picked.status}` : ""}, not the content itself.`;
  return { correct: false, text: `Not quite. ${why} Try again, or ask for a hint.`, state: { ...state, attempts } };
}
