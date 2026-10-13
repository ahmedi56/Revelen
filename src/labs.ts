// 🏋️ THE GYM'S FRONT DOOR: turns a lab name into a file path, safely.
//
// Claude only ever sends a lab NAME like "level1_strings", never a path.
// That way Revelen can only open programs inside our own labs folder,
// not any file on the learner's computer.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This file runs from dist/labs.js (built) or src/labs.ts (dev),
// so one folder up is always the project root.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The lab sources (.c) always ship with Revelen.
export const SOURCES_DIR = path.join(PROJECT_ROOT, "labs");
// The built programs (.exe) live next to them, unless REVELEN_LABS_DIR points elsewhere.
// Needed when Revelen runs from npx: its own folder is a temporary cache.
export const LABS_DIR = process.env.REVELEN_LABS_DIR
  ? path.resolve(process.env.REVELEN_LABS_DIR)
  : SOURCES_DIR;

export function labPath(name: string): string {
  // Only letters, digits and "_": blocks tricks like "..\..\Windows\notepad".
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`"${name}" isn't a valid lab name. Use names like "level1_strings".`);
  }
  const exe = path.join(LABS_DIR, `${name}.exe`);
  if (!existsSync(exe)) {
    const source = path.join(SOURCES_DIR, `${name}.c`);
    throw new Error(`Lab "${name}" isn't built yet. Compile it first: gcc "${source}" -o "${exe}"`);
  }
  return exe;
}
