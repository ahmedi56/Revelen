// 🗺️ THE COURSE MAP: the labs in order, what each one teaches, and how to
// recognise a right answer.
//
// The answers are NOT written here. We store only a "hash": a fingerprint
// made from the answer by a one-way calculation. Checking a guess means
// fingerprinting it and comparing. That way neither Claude nor someone
// reading this file gets the password for free.

import { createHash } from "node:crypto";

export interface Lesson {
  lab: string; // file name in labs/, without the extension
  title: string;
  goal: string; // what the learner is trying to find
  teaches: string; // the one new idea of this level
  firstStep: string; // a nudge for where to begin, never the answer
  answerHash: string; // SHA-256 of the answer
}

export const LESSONS: Lesson[] = [
  {
    lab: "level1_strings",
    title: "Level 1: the password in plain sight",
    goal: "Find the password the program asks for.",
    teaches: "Text written in a program's code is stored as readable text inside the .exe.",
    firstStep: "Search the program's text for a word it prints, then look at the function that uses it.",
    answerHash: "886ba8ed3a710711951491b5df5006407100b1d84e0a27c0bda6e83978029fd6",
  },
  {
    lab: "level2_pin",
    title: "Level 2: the number in the instruction",
    goal: "Find the PIN the program asks for.",
    teaches: "A number is not stored as text. It sits inside an instruction, written in hexadecimal.",
    firstStep: "Searching text won't find it. Open main, follow its CALL, and look at what CMP compares.",
    answerHash: "ee375f966141d53936b00797d7f25d0361df831141b119fddc894efa375efc6c",
  },
  {
    lab: "level3_letters",
    title: "Level 3: letters are numbers",
    goal: "Find the secret word.",
    teaches: "To a computer each letter is a number (its ASCII code), so a word can hide as a row of numbers.",
    firstStep: "Find the function that checks the word. It compares one letter at a time with a number.",
    answerHash: "2348f998744212575d85959674f9607ab26f67708a917157472832386337c904",
  },
  {
    lab: "level4_xor",
    title: "Level 4: the disguise",
    goal: "Find the secret word.",
    teaches: "XOR scrambles a value with a key, and doing the same XOR again brings the value back.",
    firstStep: "Find the key first: a small number stored near the start of the checking function.",
    answerHash: "1c31626f568a075d2fd6934828ba678fe64655ef4e78e42c49367cbbfcaf42f5",
  },
];

export function findLesson(lab: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.lab === lab);
}

// Fingerprint a guess the same way the stored answers were fingerprinted.
// Spaces around the guess are ignored; capital letters are not.
export function isRightAnswer(lesson: Lesson, guess: string): boolean {
  const hash = createHash("sha256").update(guess.trim()).digest("hex");
  return hash === lesson.answerHash;
}
