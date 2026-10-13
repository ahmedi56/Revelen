// 📓 THE DIARY: what the learner has done so far, saved in a small file so
// it is still there next week.
//
// The file lives in the learner's own home folder (C:\Users\<name>\.revelen),
// not inside Revelen, because Revelen's folder is replaced on every update.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface Progress {
  labsSolved: string[]; // lab names
  conceptsSeen: string[]; // lesson cards the learner has read
  quizzesPassed: string[]; // quiz ids answered correctly
}

// REVELEN_HOME lets the tests write to a throwaway folder instead of the real diary.
function progressFile(): string {
  const dir = process.env.REVELEN_HOME ?? path.join(homedir(), ".revelen");
  return path.join(dir, "progress.json");
}

const onlyStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function loadProgress(): Progress {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(readFileSync(progressFile(), "utf8"));
  } catch {
    // No diary yet, or it is damaged: start a fresh one rather than crash.
  }
  return {
    labsSolved: onlyStrings(saved?.labsSolved),
    conceptsSeen: onlyStrings(saved?.conceptsSeen),
    quizzesPassed: onlyStrings(saved?.quizzesPassed),
  };
}

// Add one entry to one list and save. Returns true if it was new.
export function remember(list: keyof Progress, entry: string): boolean {
  const progress = loadProgress();
  if (progress[list].includes(entry)) return false;
  progress[list].push(entry);
  try {
    const file = progressFile();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(progress, null, 2));
  } catch {
    // A diary that can't be written must never stop a lesson.
  }
  return true;
}
