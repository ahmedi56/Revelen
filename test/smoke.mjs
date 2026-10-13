// Smoke test: starts Revelen like Claude would, calls each tool, checks the answers.
// Run with:  npm test            (uses fake REA, takes seconds)
//            $env:REVELEN_REAL_REA="1"; npm test   (uses real REA + Ghidra, takes minutes)
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The plugin manifest must carry the same version as the npm package,
// otherwise Claude Code doesn't notice that the plugin was updated.
const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
assert.equal(
  readJson("../.claude-plugin/plugin.json").version,
  readJson("../package.json").version,
  "Set the same version in .claude-plugin/plugin.json and package.json"
);
console.log("✓ plugin.json and package.json versions match");

// The learner's diary goes to a throwaway folder, so tests never touch the real one.
const env = { ...process.env, REVELEN_HOME: mkdtempSync(path.join(tmpdir(), "revelen-test-")) };
if (!process.env.REVELEN_REAL_REA) {
  env.REVELEN_REA_ENTRY = fileURLToPath(new URL("./fake-rea.mjs", import.meta.url));
}

const client = new Client({ name: "revelen-smoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env }));

const text = (r) => r.content[0].text;
const call = (name, args) => client.callTool({ name, arguments: args });

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(tools, [
  "revelen_answer_quiz",
  "revelen_check_setup",
  "revelen_check_solution",
  "revelen_explain_concept",
  "revelen_find_strings",
  "revelen_progress",
  "revelen_quiz",
  "revelen_show_function",
]);
console.log("✓ 8 tools listed");

const setup = text(await call("revelen_check_setup", {}));
assert.match(setup, /Revelen setup check: \d+ of \d+ ready/);
assert.match(setup, /✅ Node\.js/);
console.log("✓ check_setup reports each part");

assert.match(text(await call("revelen_explain_concept", { concept: "SETZ" })), /SETZ/);
console.log("✓ explain_concept knows SETZ");

const strings = await call("revelen_find_strings", { lab: "level1_strings", text: "revelen" });
assert.match(text(strings), /0x140005050\s+"revelen-rocks"/);
console.log("✓ find_strings found the secret at 0x140005050");

const fn = await call("revelen_show_function", { lab: "level1_strings", function: "check_password" });
assert.match(text(fn), /\+0x1a: CALL 0x140003340/);
assert.match(text(fn), /14 instructions/);
assert.match(text(fn), /; string "revelen-rocks"/);
console.log("✓ show_function returned check_password, compacted and labelled");

const bad = await call("revelen_find_strings", { lab: "..\\..\\Windows\\notepad", text: "x" });
assert.equal(bad.isError, true);
console.log("✓ path tricks are refused");

assert.match(text(await call("revelen_explain_concept", { concept: "JE" })), /JZ \/ JE/);
console.log("✓ explain_concept accepts other names (JE)");

assert.match(text(await call("revelen_progress", {})), /Labs solved: 0 of 4/);
const wrong = text(await call("revelen_check_solution", { lab: "level1_strings", answer: "banana" }));
assert.match(wrong, /not the answer/);
assert.doesNotMatch(wrong, /revelen-rocks/);
console.log("✓ a wrong answer is refused without revealing the right one");

assert.match(text(await call("revelen_check_solution", { lab: "level1_strings", answer: " revelen-rocks " })), /Correct!/);
assert.match(text(await call("revelen_check_solution", { lab: "level2_pin", answer: "4919" })), /Correct!/);
assert.match(text(await call("revelen_check_solution", { lab: "level3_letters", answer: "open" })), /Correct!/);
assert.match(text(await call("revelen_check_solution", { lab: "level4_xor", answer: "byte" })), /last lab/);
console.log("✓ the right answer is accepted for all four labs");

const question = text(await call("revelen_quiz", { concept: "cmp" }));
assert.match(question, /Quiz cmp-1/);
assert.match(text(await call("revelen_answer_quiz", { quiz: "cmp-1", choice: "A" })), /Not quite/);
assert.match(text(await call("revelen_answer_quiz", { quiz: "cmp-1", choice: "c" })), /Correct!/);
console.log("✓ quiz: wrong choice refused, right choice accepted");

const diary = text(await call("revelen_progress", {}));
assert.match(diary, /Labs solved: 4 of 4/);
assert.match(diary, /Quiz questions passed: 1 of/);
assert.match(diary, /Lesson cards read: 2 of/);
console.log("✓ progress is saved and reported");

await client.close();
console.log("\nAll smoke tests passed 🎉");
