// 🗄️ THE ARCHIVE: keeps each web lab on disk, so it can be resumed later.
//
// Only cleaned data is ever written (the browser session itself is never kept:
// no cookies, no storage, no full responses). Files live in the learner's home
// folder, one per lab, and only the most recent ones are kept.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { CaptureResult } from "./capture.js";
import type { Comparison } from "./compare.js";
import type { LessonState } from "./lesson.js";

export const SCHEMA_VERSION = 1;
const KEEP_LABS = 20;
const ID_SHAPE = /^w-[a-f0-9]{8}$/; // only ids Revelen made: nothing else can be read as a file name

export interface StoredLab {
  schema: number;
  id: string;
  createdAt: string;
  capture: CaptureResult;
  lesson: LessonState;
  // Added in 0.6. Optional, so labs saved by 0.5 still load (they simply have no comparisons yet).
  comparisons?: Comparison[];
  lesson2?: LessonState; // the question about the newest comparison
}

function folder(): string {
  const base = process.env.REVELEN_HOME ?? path.join(homedir(), ".revelen");
  return path.join(base, "web-labs");
}

export const isLabId = (id: string) => ID_SHAPE.test(id);

export function saveLab(lab: StoredLab): void {
  const dir = folder();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${lab.id}.json`), JSON.stringify(lab));
  prune(dir);
}

export function loadLab(id: string): StoredLab | null {
  if (!isLabId(id)) return null;
  try {
    const lab = JSON.parse(readFileSync(path.join(folder(), `${id}.json`), "utf8")) as StoredLab;
    return lab.schema === SCHEMA_VERSION && lab.id === id ? lab : null; // an older format is not guessed at
  } catch {
    return null;
  }
}

export function listLabs(): StoredLab[] {
  try {
    return readdirSync(folder())
      .filter((name) => name.endsWith(".json") && isLabId(name.slice(0, -5)))
      .map((name) => loadLab(name.slice(0, -5)))
      .filter((lab): lab is StoredLab => lab !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function deleteLab(id: string): void {
  if (isLabId(id)) rmSync(path.join(folder(), `${id}.json`), { force: true });
}

// Keep only the newest labs.
function prune(dir: string): void {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, time: statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const old of files.slice(KEEP_LABS)) rmSync(path.join(dir, old.name), { force: true });
}
