// Tests for the digestive system. Run with: npm test
// They use the REAL answer REA + Ghidra gave for check_password.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compactFunction, measure } from "../dist/optimizer/compact.js";

const raw = readFileSync(new URL("./fixtures/instructions-check_password.json", import.meta.url), "utf8");
const value = JSON.parse(raw).normalized_result;
const instructions = value.instructions.map((line) => {
  const cut = line.indexOf(": ");
  return { address: line.slice(0, cut), text: line.slice(cut + 2) };
});
const compact = compactFunction("check_password", value.procedure.address, instructions, {
  labels: { "0x140005050": 'string "revelen-rocks"' },
});

test("keeps every instruction that carries logic", () => {
  for (const op of ["LEA", "CALL", "TEST EAX, EAX", "SETZ AL", "MOVZX"]) {
    assert.ok(compact.includes(op), `lost ${op}`);
  }
});

test("folds the standard prologue and epilogue into labelled lines", () => {
  assert.match(compact, /\[prologue: 3 standard setup instructions\]/);
  assert.match(compact, /\[epilogue: 3 standard cleanup instructions, ends with RET\]/);
});

test("uses short offsets and labels known addresses", () => {
  assert.match(compact, /\+0x1a: CALL 0x140003340/);
  assert.match(compact, /LEA RDX, \[0x140005050\]\s+; string "revelen-rocks"/);
});

test("a function with no standard boilerplate is left complete", () => {
  const plain = [
    { address: "0x1000", text: "CMP EAX, 0xa" },
    { address: "0x1003", text: "JNZ 0x1010" },
  ];
  const out = compactFunction("tiny", "0x1000", plain);
  assert.ok(!out.includes("prologue") && !out.includes("epilogue"));
  assert.match(out, /JNZ 0x1010/);
});

test("saves a large share of tokens compared to REA's raw JSON", () => {
  const s = measure(raw, compact);
  console.log(`  raw: ~${s.beforeTokens} tokens, compact: ~${s.afterTokens} tokens, saved ${s.percentSaved}%`);
  assert.ok(s.percentSaved > 80);
});
