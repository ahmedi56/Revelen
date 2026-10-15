#!/usr/bin/env node
// 1. Import what we need.
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
// ".js" even though the file is .ts: we write the name it will have AFTER compiling.
import { CONCEPTS, findConcept } from "./tutor/concepts.js";
import { LESSONS, findLesson, isRightAnswer } from "./tutor/lessons.js";
import { QUIZZES, findQuiz } from "./tutor/quizzes.js";
import { INTRO, STORIES, findStory } from "./tutor/stories.js";
import { loadProgress, remember } from "./progress.js";
import { searchStrings, readInstructions, ReaError, explainReaError } from "./bridge/rea.js";
import { checkSetup } from "./doctor.js";
import { labPath } from "./labs.js";
import { compactFunction } from "./optimizer/compact.js";
import { registerWebTools } from "./web/tools.js";

// Revelen's short-term memory: clues found with find_strings, per lab.
// Example: clues["level1_strings"]["0x140005050"] = 'string "revelen-rocks"'
const clues: Record<string, Record<string, string>> = {};

// 2. Create the server with a name and version (Claude sees these).
// The version is read from package.json, so there is only one place to change it.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const server = new McpServer({ name: "revelen", version });

// A small helper: turns any error into a polite tool answer instead of a crash.
function errorResult(err: unknown) {
  const message =
    err instanceof ReaError ? explainReaError(err) : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `⚠️ ${message}` }], isError: true };
}

// 3. Tool #1: explain an assembly instruction (the teacher's notebook).
server.registerTool(
  "revelen_explain_concept",
  {
    // Claude reads this to decide WHEN to use the tool.
    description:
      "Explain an assembly instruction (like MOV, CMP, JZ, XOR) or a basic idea (hex, ascii) in simple words, " +
      "with an analogy and example. Use this when the learner asks what something in a listing means.",
    // zod: we accept exactly one text field called "concept".
    inputSchema: z.object({
      concept: z.string().describe("The instruction or idea to explain, e.g. 'cmp', 'jz' or 'hex'"),
    }),
  },
  // The handler: runs when Claude calls the tool.
  async ({ concept }) => {
    const found = findConcept(concept); // "  CMP " -> the cmp card, "je" -> the jz card

    if (!found) {
      const known = Object.keys(CONCEPTS).join(", ");
      return {
        content: [{ type: "text", text: `I don't have a lesson for "${concept}" yet. I know: ${known}.` }],
        isError: true,
      };
    }

    const { key, card } = found;
    remember("conceptsSeen", key); // write it in the learner's diary
    const hasQuiz = QUIZZES.some((quiz) => quiz.concept === key);

    const lesson =
      `## ${card.name}\n\n` +
      `**Meaning:** ${card.short}\n\n` +
      `**Think of it like:** ${card.analogy}\n\n` +
      `**Example:**\n${card.example}` +
      (hasQuiz ? `\n\nA quiz exists for this one: revelen_quiz with concept "${key}".` : "");

    return { content: [{ type: "text", text: lesson }] };
  }
);

// 4. Tool #2: search the text hidden inside a lab program (uses REA = the hands).
server.registerTool(
  "revelen_find_strings",
  {
    description:
      "Search the readable text stored inside a Revelen lab program and show where each match lives. " +
      "Use this when the learner is hunting for clues such as passwords or messages. " +
      "The first call on a lab can take 1-3 minutes while Ghidra analyzes it.",
    inputSchema: z.object({
      lab: z.string().describe("Lab name, e.g. 'level1_strings'"),
      text: z.string().min(1).describe("Text to look for, e.g. 'password'"),
    }),
  },
  async ({ lab, text }) => {
    try {
      const found = await searchStrings(labPath(lab), text);
      if (found.length === 0) {
        return { content: [{ type: "text", text: `No text containing "${text}" in ${lab}. Try a shorter or different word.` }] };
      }
      // Compact output: one line per match instead of REA's 80 lines of metadata.
      // A short search word can match hundreds of texts, so only the first ones are shown.
      const MAX_SHOWN = 30;
      const lines =
        found.slice(0, MAX_SHOWN).map((s) => `${s.address}  "${s.value}"`).join("\n") +
        (found.length > MAX_SHOWN
          ? `\n...and ${found.length - MAX_SHOWN} more. Search for a longer word to see fewer, closer matches.`
          : "");
      // Remember each clue so show_function can label these addresses later.
      clues[lab] ??= {};
      for (const s of found) clues[lab][s.address] = `string "${s.value}"`;
      return {
        content: [{
          type: "text",
          text:
            `Found ${found.length} match(es) in ${lab}:\n${lines}\n\n` +
            `Next clue: the address on the left. Which function uses it? Look at a function's instructions and watch for that number.`,
        }],
      };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 5. Tool #3: show one function's assembly, one small piece of the program at a time.
server.registerTool(
  "revelen_show_function",
  {
    description:
      "Show the raw assembly instructions of ONE function in a Revelen lab program. " +
      "Use this to study a single function step by step instead of the whole program.",
    inputSchema: z.object({
      lab: z.string().describe("Lab name, e.g. 'level1_strings'"),
      function: z.string().min(1).describe("Function name or address, e.g. 'check_password'"),
    }),
  },
  async ({ lab, function: fn }) => {
    try {
      const code = await readInstructions(labPath(lab), fn);
      // Digest it: fold standard setup/cleanup, shorten addresses, label known clues.
      const listing = compactFunction(code.name, code.address, code.instructions, { labels: clues[lab] });
      return {
        content: [{
          type: "text",
          text:
            `${listing}\n\n` +
            `Offsets like +0x1a mean "0x1a bytes after the function's start".\n` +
            `Tip: ask Revelen to explain any instruction you don't know (e.g. "explain TEST").`,
        }],
      };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 6. Tool #4: the doctor. Checks that every program Revelen depends on is ready.
server.registerTool(
  "revelen_check_setup",
  {
    description:
      "Check that everything Revelen needs is installed (Node, REA, Ghidra, Java, GCC, built labs) " +
      "and list the exact fix for anything missing. " +
      "Use this when another Revelen tool fails, or when the learner is setting Revelen up.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return { content: [{ type: "text", text: await checkSetup() }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 7. Tool #5: the course map and the learner's diary.
server.registerTool(
  "revelen_progress",
  {
    description:
      "Show the list of Revelen labs in order, which ones the learner has solved, and what to do next. " +
      "Use this at the start of a session, or when the learner asks what to do or how far they are.",
    inputSchema: z.object({}),
  },
  async () => {
    const progress = loadProgress();
    const labs = LESSONS.map((lesson) => {
      const solved = progress.labsSolved.includes(lesson.lab);
      return `${solved ? "✅" : "⬜"} ${lesson.title}  (lab: ${lesson.lab})\n   ${lesson.goal} Teaches: ${lesson.teaches}`;
    });
    const next = LESSONS.find((lesson) => !progress.labsSolved.includes(lesson.lab));
    const text =
      `Labs solved: ${progress.labsSolved.length} of ${LESSONS.length}\n` +
      `Lesson cards read: ${progress.conceptsSeen.length} of ${Object.keys(CONCEPTS).length}\n` +
      `Quiz questions passed: ${progress.quizzesPassed.length} of ${QUIZZES.length}\n\n` +
      `${labs.join("\n")}\n\n` +
      (next
        ? `Next: ${next.title}. Where to begin: ${next.firstStep}`
        : "Every lab is solved. The learner can replay any lab or finish the remaining quiz questions.");
    return { content: [{ type: "text", text }] };
  }
);

// 8. Tool #6: check what the learner found, without ever revealing the answer.
server.registerTool(
  "revelen_check_solution",
  {
    description:
      "Check whether the password, PIN or word the learner found for a lab is correct, and record the lab as solved. " +
      "Use this when the learner proposes an answer. It never reveals the right answer.",
    inputSchema: z.object({
      lab: z.string().describe("Lab name, e.g. 'level1_strings'"),
      answer: z.string().min(1).describe("Exactly what the learner thinks the secret is"),
    }),
  },
  async ({ lab, answer }) => {
    const lesson = findLesson(lab);
    if (!lesson) {
      const known = LESSONS.map((l) => l.lab).join(", ");
      return { content: [{ type: "text", text: `There is no lab called "${lab}". The labs are: ${known}.` }], isError: true };
    }
    if (!isRightAnswer(lesson, answer)) {
      return {
        content: [{
          type: "text",
          text: `"${answer.trim()}" is not the answer to ${lesson.lab}. Don't give the answer away: help the learner look again. ${lesson.firstStep}`,
        }],
      };
    }
    const first = remember("labsSolved", lesson.lab);
    const next = LESSONS[LESSONS.indexOf(lesson) + 1];
    const text =
      `Correct! ${lesson.title} is solved${first ? "" : " (it was already solved before)"}.\n` +
      `What this level showed: ${lesson.teaches}\n` +
      (next ? `Next: ${next.title} (lab: ${next.lab}).` : "That was the last lab.");
    return { content: [{ type: "text", text }] };
  }
);

// 9. Tool #7: ask one quiz question. The right answer stays inside Revelen.
server.registerTool(
  "revelen_quiz",
  {
    description:
      "Get one multiple-choice question to check the learner understood an instruction or idea. " +
      "Use this after explaining something, or when the learner asks to be tested. " +
      "Ask the question as it is, then send the learner's choice to revelen_answer_quiz.",
    inputSchema: z.object({
      concept: z.string().optional().describe("Optional: limit to one lesson card, e.g. 'cmp'. Leave out for any topic."),
    }),
  },
  async ({ concept }) => {
    const key = concept ? findConcept(concept)?.key : undefined;
    if (concept && !key) {
      return { content: [{ type: "text", text: `I don't have a lesson called "${concept}", so no quiz for it.` }], isError: true };
    }
    const passed = loadProgress().quizzesPassed;
    const pool = QUIZZES.filter((quiz) => !key || quiz.concept === key);
    if (pool.length === 0) {
      return { content: [{ type: "text", text: `There is no quiz for "${key}" yet.` }] };
    }
    // Prefer a question the learner hasn't passed; otherwise repeat one as revision.
    const quiz = pool.find((q) => !passed.includes(q.id)) ?? pool[0];
    const choices = quiz.choices.map((choice, i) => `${"ABCD"[i]}. ${choice}`).join("\n");
    const revision = passed.includes(quiz.id) ? " (already passed once: this is revision)" : "";
    return {
      content: [{ type: "text", text: `Quiz ${quiz.id}${revision}\n\n${quiz.question}\n${choices}` }],
    };
  }
);

// 10. Tool #8: check the learner's choice and record a pass.
server.registerTool(
  "revelen_answer_quiz",
  {
    description:
      "Check the learner's answer to a quiz question from revelen_quiz and record it if correct. " +
      "Send the learner's own choice; don't answer for them.",
    inputSchema: z.object({
      quiz: z.string().describe("The quiz id given by revelen_quiz, e.g. 'cmp-1'"),
      choice: z.string().describe("The letter the learner chose: A, B, C or D"),
    }),
  },
  async ({ quiz: id, choice }) => {
    const quiz = findQuiz(id.trim());
    if (!quiz) {
      return { content: [{ type: "text", text: `There is no quiz with the id "${id}".` }], isError: true };
    }
    const index = "ABCD".indexOf(choice.trim().toUpperCase().charAt(0));
    if (index < 0 || index >= quiz.choices.length) {
      const letters = "ABCD".slice(0, quiz.choices.length).split("").join(", ");
      return { content: [{ type: "text", text: `The choice must be one of: ${letters}.` }], isError: true };
    }
    if (index !== quiz.answer) {
      return {
        content: [{
          type: "text",
          text: `Not quite. Don't reveal the right choice: explain "${quiz.concept}" another way, then let the learner try again.`,
        }],
      };
    }
    remember("quizzesPassed", quiz.id);
    return { content: [{ type: "text", text: `Correct! ${quiz.why}` }] };
  }
);

// 11. Tool #9: a lab told as a story, one step at a time, in plain words.
// Everything was recorded in advance, so this answers at once and needs no Ghidra.
server.registerTool(
  "revelen_story",
  {
    description:
      "Teach a Revelen lab as a real-life security story in plain words, one step at a time. " +
      "This is the default way to teach a lab to a beginner: it is instant and shows no machine code. " +
      "Call it without a step to get the situation and the new words, then with step 1, 2, 3... one per turn. " +
      "For a learner who is completely new, call it first with lab 'intro': what reverse engineering is and what they will be able to do.",
    inputSchema: z.object({
      lab: z.string().describe("Lab name, e.g. 'level1_strings', or 'intro' for the introduction"),
      step: z.number().int().min(0).optional().describe("0 or left out = the situation. 1, 2, 3... = that step."),
    }),
  },
  async ({ lab, step = 0 }) => {
    // "intro" is the page before the first level: what reverse engineering is and what the words mean.
    if (lab.trim().toLowerCase() === "intro") {
      return { content: [{ type: "text", text: `TELL THIS TO A NEW LEARNER, a part at a time, in your own simple words:\n\n${INTRO}` }] };
    }
    const story = findStory(lab);
    if (!story) {
      const known = STORIES.map((s) => s.lab).join(", ");
      return {
        content: [{ type: "text", text: `There is no story for "${lab}" yet. Stories exist for: ${known}. Use the other Revelen tools for this lab.` }],
        isError: true,
      };
    }

    if (step === 0) {
      const text =
        `STORY: ${story.title} (${story.steps.length} steps)\n\n` +
        `THE SITUATION (tell it to the learner):\n${story.situation}\n\n` +
        `NEW WORDS IN THIS LEVEL (explain them before step 1, so none of them comes as a surprise):\n` +
        story.words.map((w) => `- ${w.word}: ${w.meaning}`).join("\n");
      return { content: [{ type: "text", text }] };
    }

    const current = story.steps[step - 1];
    if (!current) {
      return {
        content: [{ type: "text", text: `This story has ${story.steps.length} steps, so there is no step ${step}.` }],
        isError: true,
      };
    }

    const parts = [`STEP ${step} of ${story.steps.length}: ${current.title}`, `SAY:\n${current.say}`];
    if (current.run) {
      // Give the exact command, or say how to build the program if it isn't there yet.
      try {
        parts.push(`THE LEARNER RUNS THIS:\n${labPath(lab)}`);
      } catch (err) {
        parts.push(`THE PROGRAM IS NOT BUILT YET. ${err instanceof Error ? err.message : ""}`);
      }
    }
    if (current.show) parts.push(`SHOW EXACTLY THIS:\n${current.show}`);
    parts.push(`ASK:\n${current.ask}`);
    parts.push(`A GOOD ANSWER (for you only, never read it out):\n${current.goodAnswer}`);
    if (current.deeper) parts.push(`ONLY IF THE LEARNER ASKS HOW IT WORKS INSIDE:\n${current.deeper}`);
    if (step === story.steps.length) {
      parts.push(`AFTER THEIR ANSWER, FINISH WITH THE FIX:\n${story.fix}`);
      parts.push(`THEN CONNECT IT TO THE REAL NAMES, so the learner knows what they did:\n${story.realNames}`);
    }

    return { content: [{ type: "text", text: parts.join("\n\n") }] };
  }
);

// 12. The web lab tools: investigate how a public website behaves (see src/web/).
registerWebTools(server);

// 13. Connect to Claude through stdin/stdout.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Revelen is running"); // stderr, NEVER console.log!
}

main();
