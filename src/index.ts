#!/usr/bin/env node
// 1. Import what we need.
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
// ".js" even though the file is .ts: we write the name it will have AFTER compiling.
import { CONCEPTS } from "./tutor/concepts.js";
import { searchStrings, readInstructions, ReaError, explainReaError } from "./bridge/rea.js";
import { checkSetup } from "./doctor.js";
import { labPath } from "./labs.js";
import { compactFunction } from "./optimizer/compact.js";

// Revelen's short-term memory: clues found with find_strings, per lab.
// Example: clues["level1_strings"]["0x140005050"] = 'string "revelen-rocks"'
const clues: Record<string, Record<string, string>> = {};

// 2. Create the server with a name and version (Claude sees these).
const server = new McpServer({ name: "revelen", version: "0.2.2" });

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
      "Explain an assembly instruction (like MOV, CMP, JZ) in simple words, with an analogy and example. " +
      "Use this when the learner asks what an instruction means.",
    // zod: we accept exactly one text field called "concept".
    inputSchema: z.object({
      concept: z.string().describe("The instruction to explain, e.g. 'cmp' or 'jz'"),
    }),
  },
  // The handler: runs when Claude calls the tool.
  async ({ concept }) => {
    const key = concept.trim().toLowerCase(); // "  CMP " -> "cmp"
    const card = CONCEPTS[key];

    if (!card) {
      const known = Object.keys(CONCEPTS).join(", ");
      return {
        content: [{ type: "text", text: `I don't have a lesson for "${concept}" yet. I know: ${known}.` }],
        isError: true,
      };
    }

    const lesson =
      `## ${card.name}\n\n` +
      `**Meaning:** ${card.short}\n\n` +
      `**Think of it like:** ${card.analogy}\n\n` +
      `**Example:**\n${card.example}`;

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
      const lines = found.map((s) => `${s.address}  "${s.value}"`).join("\n");
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
      return { content: [{ type: "text", text: checkSetup() }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// 7. Connect to Claude through stdin/stdout.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Revelen is running"); // stderr, NEVER console.log!
}

main();
