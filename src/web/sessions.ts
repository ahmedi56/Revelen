// 🧭 THE LAB DESK: starts, finds and finishes web labs.
//
// Starting a lab visits the address once, keeps the cleaned evidence, and closes
// the browser straight away: nothing stays open in the background. Everything
// after that (timeline, request details, hints, answers) works from the saved
// evidence, which is also what makes a lab resumable days later.

import { randomBytes } from "node:crypto";
import { capture, LIMITS, WebLabError } from "./capture.js";
import { LESSON2_ID, MAX_COMPARISONS, type Comparison } from "./compare.js";
import { freshLesson } from "./lesson.js";
import type { Allowance } from "./policy.js";
import { loadLab, saveLab, SCHEMA_VERSION, type StoredLab } from "./store.js";

const MAX_LABS_AT_ONCE = 2; // browsers are heavy: two visits at the same time at most
let running = 0;

// The test suite reaches its own local test website through this variable,
// for example REVELEN_WEB_TEST_ALLOW=127.0.0.1:54321. Only exact host:port
// pairs listed there are let through, and the MCP tools offer no way to set it.
function testAllowances(): Allowance[] {
  return (process.env.REVELEN_WEB_TEST_ALLOW ?? "")
    .split(",")
    .map((pair) => /^([\w.:-]+):(\d+)$/.exec(pair.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ host: match[1], port: Number(match[2]) }));
}

export async function startLab(url: string): Promise<StoredLab> {
  if (running >= MAX_LABS_AT_ONCE) throw new WebLabError("Two web labs are already loading. Wait for one to finish.");
  running += 1;
  try {
    const live = await capture(url, { allow: testAllowances() });
    await live.close(); // the evidence is in; the browser is not needed any more
    const lab: StoredLab = {
      schema: SCHEMA_VERSION,
      id: `w-${randomBytes(4).toString("hex")}`,
      createdAt: new Date().toISOString(),
      capture: live.result,
      lesson: freshLesson(),
    };
    saveLab(lab);
    return lab;
  } finally {
    running -= 1;
  }
}

// Words typed into a page during a lab should never be personal. Anything that looks
// like an e-mail address, a phone or card number, or a password-like string is refused.
const PERSONAL = /@|\d{6,}|password|passwd/i;

// Repeat the visit, do one action from the page's list, and keep what came after it.
export async function compareLab(lab: StoredLab, actionId: string, text?: string): Promise<{ lab: StoredLab; comparison: Comparison }> {
  const action = lab.capture.actions?.find((a) => a.id === actionId.toLowerCase());
  if (!action) throw new WebLabError(`There is no action ${actionId} in ${lab.id}. Call revelen_compare_network_activity without an action to see the list.`);
  const typed = action.kind === "type" ? (text ?? "").replace(/\s+/g, " ").trim() : null;
  if (action.kind === "type" && !typed) throw new WebLabError("This action types into a box: give the words to type.");
  if (typed && (typed.length > LIMITS.maxTypedChars || PERSONAL.test(typed))) {
    throw new WebLabError(`Type ordinary search words only (at most ${LIMITS.maxTypedChars} characters, nothing personal such as e-mail addresses or numbers).`);
  }
  if (!lab.capture.finalUrl) throw new WebLabError("The first visit has no page to go back to.");
  if (running >= MAX_LABS_AT_ONCE) throw new WebLabError("Two web labs are already busy. Wait for one to finish.");

  running += 1;
  try {
    const live = await capture(lab.capture.finalUrl, { allow: testAllowances(), act: { action, text: typed ?? undefined } });
    await live.close();
    const outcome = live.result.outcome!;
    const previous = lab.comparisons ?? [];
    const comparison: Comparison = {
      id: `c${previous.length ? Number(previous[previous.length - 1].id.slice(1)) + 1 : 1}`,
      at: new Date().toISOString(),
      action,
      typed,
      outcome,
      before: live.result.requests.slice(0, outcome.firstRequestAfter),
      after: live.result.requests.slice(outcome.firstRequestAfter),
    };
    const updated: StoredLab = { ...lab, comparisons: [...previous, comparison].slice(-MAX_COMPARISONS), lesson2: freshLesson(LESSON2_ID) };
    saveLab(updated);
    return { lab: updated, comparison };
  } finally {
    running -= 1;
  }
}

export function findLab(id: string): StoredLab {
  const lab = loadLab(id.trim());
  if (!lab) throw new WebLabError(`There is no saved web lab called "${id}". Use revelen_web_progress to see your labs.`);
  return lab;
}

export function updateLab(lab: StoredLab): void {
  saveLab(lab);
}
