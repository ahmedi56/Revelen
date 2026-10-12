// 🫁 THE DIGESTIVE SYSTEM: turns big, noisy analysis output into small, clean pieces.
//
// Golden rule: we only remove REPEATED or BORING presentation, never logic.
// Every compare, test, jump, call and data move stays. A summary that hides a
// branch would teach the learner something false, so this file is plain,
// deterministic code (no AI guessing) and it is covered by tests.

import type { Instruction } from "../bridge/rea.js";

// ---------------------------------------------------------------------------
// 1. Measuring. Real tokenizers differ between AI models, but ~4 characters per
//    token is a common rule of thumb for English and code. Good enough to
//    compare "before" and "after"; the README will say it's an estimate.
// ---------------------------------------------------------------------------
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface Savings {
  beforeTokens: number;
  afterTokens: number;
  percentSaved: number;
}

export function measure(before: string, after: string): Savings {
  const beforeTokens = estimateTokens(before);
  const afterTokens = estimateTokens(after);
  const percentSaved = beforeTokens === 0 ? 0 : Math.round((1 - afterTokens / beforeTokens) * 100);
  return { beforeTokens, afterTokens, percentSaved };
}

// ---------------------------------------------------------------------------
// 2. Recognizing the "boring" standard parts of a function.
//    Almost every function starts by preparing its stack space (prologue)
//    and ends by cleaning it up (epilogue). Learners need to see them once,
//    then they're noise. We fold them into one labelled line, never delete them.
// ---------------------------------------------------------------------------
const PROLOGUE = [/^PUSH RBP$/, /^MOV RBP, ?RSP$/, /^SUB RSP, ?0x[0-9a-f]+$/i];
const EPILOGUE = [/^ADD RSP, ?0x[0-9a-f]+$/i, /^POP RBP$/, /^(LEAVE|RET)$/];

function countMatching(lines: Instruction[], patterns: RegExp[], fromEnd = false): number {
  const list = fromEnd ? [...lines].reverse() : lines;
  const pats = fromEnd ? [...patterns].reverse() : patterns;
  let count = 0;
  for (const ins of list) {
    // Stop at the first instruction that doesn't fit the standard pattern.
    if (!pats.some((p) => p.test(ins.text))) break;
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 3. Shortening addresses. Inside one function, "0x140001777" is mostly
//    repetition of the start address. "+0x17" (17 hex bytes after the start)
//    says the same thing in fewer characters.
// ---------------------------------------------------------------------------
function offset(address: string, start: bigint): string {
  return `+0x${(BigInt(address) - start).toString(16)}`;
}

export interface CompactOptions {
  // Known addresses → friendly labels, e.g. { "0x140005050": 'string "revelen-rocks"' }
  labels?: Record<string, string>;
  // Fold the standard prologue/epilogue into one line each (default: true).
  foldBoilerplate?: boolean;
}

export function compactFunction(
  name: string,
  startAddress: string,
  instructions: Instruction[],
  options: CompactOptions = {}
): string {
  const { labels = {}, foldBoilerplate = true } = options;
  const start = BigInt(startAddress);

  const head = foldBoilerplate ? countMatching(instructions, PROLOGUE) : 0;
  // Never let prologue and epilogue overlap on tiny functions.
  const tail = foldBoilerplate ? Math.min(countMatching(instructions, EPILOGUE, true), instructions.length - head) : 0;
  const body = instructions.slice(head, instructions.length - tail);

  const out: string[] = [`${name} @ ${startAddress} (${instructions.length} instructions)`];
  if (head > 0) out.push(`  [prologue: ${head} standard setup instructions]`);

  for (const ins of body) {
    // Add a label comment when the line mentions an address we recognize.
    const notes = Object.entries(labels)
      .filter(([addr]) => ins.text.toLowerCase().includes(addr.toLowerCase()))
      .map(([, label]) => label);
    const comment = notes.length ? `   ; ${notes.join(", ")}` : "";
    out.push(`  ${offset(ins.address, start)}: ${ins.text}${comment}`);
  }

  if (tail > 0) out.push(`  [epilogue: ${tail} standard cleanup instructions, ends with RET]`);
  return out.join("\n");
}
