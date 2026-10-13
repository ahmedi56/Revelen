// 🩺 THE DOCTOR: checks that everything Revelen needs is installed.
//
// Revelen depends on several other programs (Node, REA, Ghidra, Java, GCC).
// When one is missing, the error usually shows up far away from the cause.
// This file looks at each part directly and says, in plain words, what is
// ready, what is missing, and the exact command that fixes it.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { findReaEntry } from "./bridge/rea.js";
import { LABS_DIR, SOURCES_DIR } from "./labs.js";

interface Check {
  ok: boolean;
  name: string;
  detail: string;
  fix?: string; // what the learner should do, only when ok is false
}

function checkNode(): Check {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = major > 22 || (major === 22 && minor >= 19);
  return {
    ok,
    name: "Node.js",
    detail: `version ${process.versions.node}`,
    fix: "Install Node.js 22.19 or newer from https://nodejs.org",
  };
}

function checkRea(): Check {
  try {
    return { ok: true, name: "REA", detail: `found at ${findReaEntry()}` };
  } catch {
    return { ok: false, name: "REA", detail: "not installed", fix: "npm install --global rea-agents" };
  }
}

function checkGhidra(): Check {
  const dir = process.env.GHIDRA_INSTALL_DIR;
  if (!dir) {
    return {
      ok: false,
      name: "Ghidra",
      detail: "the GHIDRA_INSTALL_DIR variable isn't set, so REA can't find Ghidra",
      fix: `[Environment]::SetEnvironmentVariable("GHIDRA_INSTALL_DIR", "C:\\tools\\ghidra_12.1.4_PUBLIC", "User")  (use your own Ghidra folder, then restart Claude)`,
    };
  }
  const ok = existsSync(path.join(dir, "ghidraRun.bat")) || existsSync(path.join(dir, "ghidraRun"));
  return {
    ok,
    name: "Ghidra",
    detail: ok ? `found at ${dir}` : `GHIDRA_INSTALL_DIR points to ${dir}, but Ghidra isn't there`,
    fix: "Point GHIDRA_INSTALL_DIR at the folder that contains ghidraRun.bat",
  };
}

function checkProvider(): Check {
  const provider = process.env.REA_ANALYSIS_PROVIDER;
  return {
    ok: provider === "ghidra",
    name: "REA uses Ghidra",
    detail: provider ? `REA_ANALYSIS_PROVIDER is "${provider}"` : "the REA_ANALYSIS_PROVIDER variable isn't set",
    fix: `[Environment]::SetEnvironmentVariable("REA_ANALYSIS_PROVIDER", "ghidra", "User")  (then restart Claude)`,
  };
}

function checkJava(): Check {
  const home = process.env.JAVA_HOME;
  const ok = !!home && (existsSync(path.join(home, "bin", "java.exe")) || existsSync(path.join(home, "bin", "java")));
  return {
    ok,
    name: "Java (Ghidra needs it)",
    detail: ok ? `found at ${home}` : home ? `JAVA_HOME points to ${home}, but Java isn't there` : "the JAVA_HOME variable isn't set",
    fix: "Install a JDK 21 (winget install EclipseAdoptium.Temurin.21.JDK) and set JAVA_HOME to its folder",
  };
}

function checkGcc(): Check {
  try {
    execFileSync("gcc", ["--version"], { stdio: "ignore", timeout: 10_000 });
    return { ok: true, name: "GCC (builds the labs)", detail: "found" };
  } catch {
    return {
      ok: false,
      name: "GCC (builds the labs)",
      detail: "not found",
      fix: "winget install BrechtSanders.WinLibs.POSIX.UCRT  (then open a new terminal)",
    };
  }
}

// One check per lab: is its program built yet?
function checkLabs(): Check[] {
  let sources: string[] = [];
  try {
    sources = readdirSync(SOURCES_DIR).filter((f) => f.endsWith(".c"));
  } catch {
    // no labs folder: reported below
  }
  if (sources.length === 0) {
    return [{ ok: false, name: "Labs", detail: `no lab sources in ${SOURCES_DIR}`, fix: "Reinstall Revelen" }];
  }
  return sources.map((file) => {
    const name = path.basename(file, ".c");
    const exe = path.join(LABS_DIR, `${name}.exe`);
    const ok = existsSync(exe);
    return {
      ok,
      name: `Lab ${name}`,
      detail: ok ? "built" : "not built yet",
      fix: `gcc "${path.join(SOURCES_DIR, file)}" -o "${exe}"`,
    };
  });
}

export function checkSetup(): string {
  const checks = [checkNode(), checkRea(), checkGhidra(), checkProvider(), checkJava(), checkGcc(), ...checkLabs()];
  const ready = checks.filter((c) => c.ok).length;
  const lines = checks.map((c) =>
    c.ok ? `✅ ${c.name}: ${c.detail}` : `❌ ${c.name}: ${c.detail}\n   Fix: ${c.fix}`
  );
  const verdict =
    ready === checks.length
      ? "Everything is ready."
      : "Fix the ❌ lines from top to bottom, one at a time, then run this check again.";
  return `Revelen setup check: ${ready} of ${checks.length} ready\n\n${lines.join("\n")}\n\n${verdict}`;
}
