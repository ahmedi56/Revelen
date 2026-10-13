// Smoke test: starts Revelen like Claude would, calls each tool, checks the answers.
// Run with:  npm test            (uses fake REA, takes seconds)
//            $env:REVELEN_REAL_REA="1"; npm test   (uses real REA + Ghidra, takes minutes)
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const env = { ...process.env };
if (!process.env.REVELEN_REAL_REA) {
  env.REVELEN_REA_ENTRY = fileURLToPath(new URL("./fake-rea.mjs", import.meta.url));
}

const client = new Client({ name: "revelen-smoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env }));

const text = (r) => r.content[0].text;
const call = (name, args) => client.callTool({ name, arguments: args });

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(tools, ["revelen_check_setup", "revelen_explain_concept", "revelen_find_strings", "revelen_show_function"]);
console.log("✓ 4 tools listed");

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

await client.close();
console.log("\nAll smoke tests passed 🎉");
