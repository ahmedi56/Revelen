// 🎓 THE FIRST WEB LESSON: "Where does a page come from?"
//
// Everything in it is worked out from the evidence of this one visit, never
// from general knowledge about the website: the explanation, the question,
// the right answer, the hints, and what to say about a wrong answer.
// It needs no AI at all, so it works the same with any assistant, or none.

import type { CaptureResult } from "./capture.js";
import { describeSize, mainDocument } from "./evidence.js";

export const LESSON_ID = "web-1-page-origin";

export interface LessonState {
  lesson: string;
  hintsUsed: number;
  attempts: number;
  solved: boolean;
  solvedAt: string | null;
}

export const freshLesson = (lesson = LESSON_ID): LessonState => ({ lesson, hintsUsed: 0, attempts: 0, solved: false, solvedAt: null });

// The one observation the lesson starts from, explained.
export function explainFirstObservation(capture: CaptureResult): string {
  const main = mainDocument(capture);
  if (!main) {
    return (
      "THE OBSERVATION: the browser could not get the page itself, so there is no main document to study. " +
      "The evidence is not enough for this lesson. Try another address."
    );
  }
  const chain = capture.requests.filter((r) => r.isMainDocument);
  const redirects =
    chain.length > 1
      ? ` Before that, the address sent the browser somewhere else ${chain.length - 1} time(s) (a redirect). Each redirect is a request of its own.`
      : "";
  return (
    "THE OBSERVATION: when you type an address, the browser first asks for ONE thing: the document, the page's HTML skeleton. " +
    "Everything else (styles, scripts, pictures, data) is requested afterwards, because the HTML asks for it." +
    redirects +
    ` In this visit the browser made ${capture.requests.length} request(s) in total.`
  );
}

export const QUESTION =
  "THE QUESTION: look at the timeline. Which request brought the page's HTML? Answer with its number, for example r1.";

const normalize = (answer: string) => {
  const match = /r?\s*(\d+)/i.exec(answer.trim());
  return match ? `r${match[1]}` : answer.trim().toLowerCase();
};

// Hints get more direct each time. The last one gives the answer, with the reason.
export function nextHint(capture: CaptureResult, state: LessonState): { text: string; state: LessonState } {
  const main = mainDocument(capture);
  if (!main) return { text: "There is no main document in this visit, so there is nothing to find.", state };
  const chain = capture.requests.filter((r) => r.isMainDocument);
  const hints = [
    "Hint 1: the HTML travels in a request whose type is 'document'. Look down the type column of the timeline.",
    chain.length > 1
      ? "Hint 2: there were redirects. The HTML is in the LAST request of the chain, the one that did not redirect again."
      : "Hint 2: there is only one 'document' request in this visit, and it is marked 'main document'.",
    `Hint 3 (the answer): it is ${main.id}. It is a document request${main.status ? ` that answered ${main.status}` : ""}${main.contentType ? ` with type ${main.contentType}` : ""}, and every other request came after it.`,
  ];
  const index = Math.min(state.hintsUsed, hints.length - 1);
  return { text: hints[index], state: { ...state, hintsUsed: Math.min(state.hintsUsed + 1, hints.length) } };
}

// Check an answer against the evidence, and explain the result from the evidence too.
export function checkAnswer(capture: CaptureResult, state: LessonState, answer: string): { correct: boolean; text: string; state: LessonState } {
  const main = mainDocument(capture);
  const attempts = state.attempts + 1;
  if (!main) {
    return { correct: false, text: "This visit has no main document, so the lesson cannot be answered.", state: { ...state, attempts } };
  }
  const given = normalize(answer);
  if (given === main.id) {
    return {
      correct: true,
      text:
        `Correct: ${main.id} brought the HTML (${describeSize(main.responseBytes)}). ` +
        "You found it by its type, not by guessing, and that is the habit that matters: a claim about a website should point at the evidence. " +
        "Next, look at what the HTML asked for: the scripts and stylesheets that came right after it.",
      state: { ...state, attempts, solved: true, solvedAt: state.solvedAt ?? new Date().toISOString() },
    };
  }
  const picked = capture.requests.find((r) => r.id === given);
  let why = `There is no request called ${given} in this visit.`;
  if (picked?.isMainDocument) why = `${picked.id} is part of the main document's chain, but it ${picked.status && picked.status >= 300 && picked.status < 400 ? `answered ${picked.status}: a redirect, which only says "go elsewhere"` : "is not the one that carried the HTML"}.`;
  else if (picked) why = `${picked.id} is a ${picked.resourceType} request${picked.contentType ? ` of type ${picked.contentType}` : ""}. The page asked for it, so it came after the HTML.`;
  return { correct: false, text: `Not that one. ${why} Try again, or ask for a hint.`, state: { ...state, attempts } };
}
