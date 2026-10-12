// A stand-in for REA during tests: replays real answers recorded from REA + Ghidra.
// This lets us test Revelen in seconds, without Ghidra, on any computer.
import { readFileSync } from "node:fs";

const [command, , option] = process.argv.slice(2);
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

if (command === "search" && option === "--pattern=revelen") {
  process.stdout.write(fixture("search-revelen.json"));
} else if (command === "instructions" && option === "--procedure=check_password") {
  process.stdout.write(fixture("instructions-check_password.json"));
} else {
  // Same shape as a real REA error.
  process.stdout.write(JSON.stringify({ error: "Analysis failed", code: "not_found", message: `Fake REA has no answer for: ${process.argv.slice(2).join(" ")}` }));
  process.exitCode = 1;
}
