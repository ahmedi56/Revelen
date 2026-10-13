// ❓ THE QUIZ BOOK: small multiple-choice questions, one idea each.
//
// Claude receives the question and the choices, but not which choice is right:
// the right answer stays here and is only revealed after the learner answers.

export interface Quiz {
  id: string;
  concept: string; // which lesson card this question tests (a key of CONCEPTS)
  question: string;
  choices: string[];
  answer: number; // position of the right choice, starting at 0
  why: string; // shown after answering, right or wrong
}

export const QUIZZES: Quiz[] = [
  {
    id: "mov-1",
    concept: "mov",
    question: "After 'mov eax, 7' and then 'mov ebx, eax', what does ebx hold?",
    choices: ["0", "7", "Nothing: eax was emptied"],
    answer: 1,
    why: "MOV copies. eax still holds 7 afterwards, and ebx now holds 7 too.",
  },
  {
    id: "cmp-1",
    concept: "cmp",
    question: "What does 'cmp eax, 10' change?",
    choices: ["It sets eax to 10", "It subtracts 10 from eax and keeps the result in eax", "Only the flags: eax stays the same"],
    answer: 2,
    why: "CMP subtracts in its head, throws the result away, and keeps only the flags (equal? smaller?).",
  },
  {
    id: "jz-1",
    concept: "jz",
    question: "eax holds 10. After 'cmp eax, 10' comes 'jz correct'. What happens?",
    choices: ["The jump is taken", "The jump is skipped", "The program stops"],
    answer: 0,
    why: "The two values are equal, so the zero flag is set, and JZ jumps when that flag is set.",
  },
  {
    id: "jnz-1",
    concept: "jnz",
    question: "eax holds 10. After 'cmp eax, 10' comes 'jnz wrong'. What happens?",
    choices: ["The program jumps to 'wrong'", "The jump is skipped and the next line runs", "eax becomes 0"],
    answer: 1,
    why: "JNZ jumps only when the values were NOT equal. Here they are equal, so the program continues on the next line.",
  },
  {
    id: "test-1",
    concept: "test",
    question: "Why do programs so often write 'test eax, eax' right after a CALL?",
    choices: ["To double eax", "To ask 'is the result zero?' without changing it", "To erase eax"],
    answer: 1,
    why: "A function leaves its result in eax. TEST looks at it and sets the flags, like CMP with zero, without changing it.",
  },
  {
    id: "call-1",
    concept: "call",
    question: "A function finishes with RET. Where does the program continue?",
    choices: ["At the start of the program", "On the line just after the CALL that started the function", "It stops"],
    answer: 1,
    why: "CALL remembers where it was before leaving. RET goes back to that spot.",
  },
  {
    id: "hex-1",
    concept: "hex",
    question: "A listing shows 'cmp eax, 0x10'. Which ordinary number is eax compared with?",
    choices: ["10", "16", "2"],
    answer: 1,
    why: "0x means hexadecimal, base 16. 0x10 is one sixteen and zero ones: 16.",
  },
  {
    id: "ascii-1",
    concept: "ascii",
    question: "The letter 'a' is 0x61 in ASCII. Which letter is 0x63?",
    choices: ["b", "c", "d"],
    answer: 1,
    why: "The letters follow each other: 0x61 is a, 0x62 is b, 0x63 is c.",
  },
  {
    id: "xor-1",
    concept: "xor",
    question: "A letter was scrambled with 'xor 5' and became 0x67. How do you get the letter back?",
    choices: ["Subtract 5", "XOR it with 5 again", "It can't be undone"],
    answer: 1,
    why: "XOR undoes itself: scrambling twice with the same key returns the original. 0x67 xor 5 is 0x62, the letter b.",
  },
  {
    id: "xor-2",
    concept: "xor",
    question: "What does 'xor eax, eax' leave in eax?",
    choices: ["0", "eax doubled", "The same value as before"],
    answer: 0,
    why: "Any value XORed with itself gives 0. Programs use this as a short way to write 'set eax to zero'.",
  },
];

export function findQuiz(id: string): Quiz | undefined {
  return QUIZZES.find((quiz) => quiz.id === id);
}
