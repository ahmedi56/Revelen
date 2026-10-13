// Checks the teaching material itself: every quiz and lab must be consistent.
// Run with: npm test (needs a build first, because it imports from dist/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CONCEPTS, findConcept } from "../dist/tutor/concepts.js";
import { LESSONS } from "../dist/tutor/lessons.js";
import { QUIZZES } from "../dist/tutor/quizzes.js";
import { STORIES } from "../dist/tutor/stories.js";

test("every quiz tests a real lesson card and has a valid answer", () => {
  for (const quiz of QUIZZES) {
    assert.ok(CONCEPTS[quiz.concept], `${quiz.id}: no lesson card "${quiz.concept}"`);
    assert.ok(quiz.choices.length >= 2 && quiz.choices.length <= 4, `${quiz.id}: needs 2 to 4 choices`);
    assert.ok(quiz.answer >= 0 && quiz.answer < quiz.choices.length, `${quiz.id}: answer is out of range`);
  }
});

test("quiz ids are unique", () => {
  const ids = QUIZZES.map((quiz) => quiz.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every lab in the course has its source file", () => {
  for (const lesson of LESSONS) {
    const source = fileURLToPath(new URL(`../labs/${lesson.lab}.c`, import.meta.url));
    assert.ok(existsSync(source), `${lesson.lab}.c is missing from labs/`);
    assert.match(lesson.answerHash, /^[0-9a-f]{64}$/);
  }
});

test("every story belongs to a lab and every step asks one question", () => {
  for (const story of STORIES) {
    assert.ok(LESSONS.some((lesson) => lesson.lab === story.lab), `story for unknown lab "${story.lab}"`);
    assert.ok(story.steps.length > 0 && story.fix && story.realNames && story.words.length > 0);
    for (const step of story.steps) {
      assert.ok(step.say && step.ask && step.goodAnswer, `${story.lab}: "${step.title}" is incomplete`);
      // Machine code and memory addresses may only appear in the optional "deeper" part.
      assert.doesNotMatch(step.say + step.ask + (step.show ?? ""), /\b(MOV|MOVZX|CMP|LEA|CALL)\b|0x14[0-9a-f]{4,}/);
    }
  }
});

test("every lab has a story", () => {
  for (const lesson of LESSONS) {
    assert.ok(STORIES.some((story) => story.lab === lesson.lab), `${lesson.lab} has no story`);
  }
});

test("other names lead to the right card", () => {
  assert.equal(findConcept("JNE")?.key, "jnz");
  assert.equal(findConcept(" movsx ")?.key, "movzx");
  assert.equal(findConcept("nonsense"), undefined);
});
