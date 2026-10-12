// ✋ THE HANDS: Revelen's connection to REA.
//
// Revelen never lets Claude talk to REA directly. Instead, this file runs the
// `rea` command line tool as a "child process", asks for JSON output, and
// returns only the pieces Revelen needs. That keeps Revelen in control of
// what the learner sees (and how many tokens it costs).

import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// A special error type, so the rest of Revelen can tell "REA said no"
// apart from a bug in our own code.
export class ReaError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "ReaError";
  }
}

// ---------------------------------------------------------------------------
// Step 1: find REA's real JavaScript file.
//
// On Windows, `rea` is really `rea.cmd`, a tiny batch script. Running batch
// scripts from Node needs a shell, and shells are where quoting bugs and
// injection attacks live. So we skip the batch file: we find the JavaScript
// file it points to and run that with Node directly. No shell involved.
// ---------------------------------------------------------------------------
let cachedEntry: string | undefined;

export function findReaEntry(): string {
  if (cachedEntry) return cachedEntry;

  // Escape hatch: tests (and unusual setups) can point to a different file.
  const override = process.env.REVELEN_REA_ENTRY;
  if (override) return (cachedEntry = override);

  // Ask npm where global packages live, e.g. C:\Users\T560\AppData\Roaming\npm\node_modules
  const isWindows = process.platform === "win32";
  const globalRoot = execFileSync(isWindows ? "npm.cmd" : "npm", ["root", "-g"], {
    encoding: "utf8",
    shell: isWindows, // fixed arguments only, so a shell is safe here
  }).trim();

  // REA's package.json says which file the `rea` command runs.
  const pkgDir = path.join(globalRoot, "rea-agents");
  let pkg: { bin?: string | Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  } catch {
    throw new ReaError("REA isn't installed. Run: npm install --global rea-agents", "rea_missing");
  }
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.rea;
  if (!bin) throw new ReaError("Couldn't find REA's entry file in its package.json", "rea_missing");

  return (cachedEntry = path.join(pkgDir, bin));
}

// ---------------------------------------------------------------------------
// Step 2: run one REA command and return its parsed JSON answer.
// ---------------------------------------------------------------------------
export function runRea(args: string[], timeoutMs = 5 * 60_000): Promise<any> {
  return new Promise((resolve, reject) => {
    let entry: string;
    try {
      entry = findReaEntry();
    } catch (err) {
      return reject(err);
    }

    // process.execPath = the Node program running Revelen right now.
    const child = spawn(process.execPath, [entry, ...args, "--format", "json"], {
      windowsHide: true, // no black console window popping up on Windows
    });

    // Output arrives in chunks, so we collect them and join at the end.
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));

    // Safety net: Ghidra can be slow, but never let it hang forever.
    const timer = setTimeout(() => {
      child.kill();
      reject(new ReaError(`REA took longer than ${timeoutMs / 1000}s and was stopped`, "timeout"));
    }, timeoutMs);

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new ReaError(`Couldn't start REA: ${e.message}`, "spawn_failed"));
    });

    child.on("close", () => {
      clearTimeout(timer);
      // Strip a possible BOM: an invisible marker some Windows tools put at the start of text.
      const text = Buffer.concat(out).toString("utf8").replace(/^\uFEFF/, "").trim();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        const stderr = Buffer.concat(err).toString("utf8").trim().slice(-500);
        return reject(new ReaError(`REA returned something that isn't JSON. ${stderr}`, "bad_output"));
      }

      // REA reports failures as JSON too: {"error": ..., "code": ..., "message": ...}
      if (json && typeof json === "object" && "error" in json) {
        return reject(new ReaError(json.message ?? String(json.error), json.code));
      }
      resolve(json);
    });
  });
}

// ---------------------------------------------------------------------------
// Step 3: friendly helpers. Each one runs a command and keeps only the useful part.
// Notice the `--pattern=` and `--procedure=` forms: if a learner searched for
// text starting with "-", REA would otherwise mistake it for an option.
// ---------------------------------------------------------------------------

export interface FoundString {
  address: string; // where it lives in the program, e.g. "0x140005050"
  value: string;   // the text itself
}

export async function searchStrings(exePath: string, text: string): Promise<FoundString[]> {
  const json = await runRea(["search", exePath, `--pattern=${text}`]);
  const result = json.normalized_result;
  return Array.isArray(result) ? result : (result?.value ?? []);
}

export interface Instruction {
  address: string; // e.g. "0x14000177a"
  text: string;    // e.g. "CALL 0x140003340"
}

export interface FunctionCode {
  name: string;
  address: string;
  instructions: Instruction[];
}

export async function readInstructions(exePath: string, functionName: string): Promise<FunctionCode> {
  const json = await runRea(["instructions", exePath, `--procedure=${functionName}`]);
  const value = json.normalized_result;
  return {
    name: value.procedure.name,
    address: value.procedure.address,
    // REA gives lines like "0x14000177a: CALL 0x140003340". We split them in two.
    instructions: (value.instructions as string[]).map((line) => {
      const cut = line.indexOf(": ");
      return { address: line.slice(0, cut), text: line.slice(cut + 2) };
    }),
  };
}
