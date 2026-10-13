// A "Concept" is one lesson card. Every card MUST have these four fields.
export interface Concept {
  name: string;     // Official name, e.g. "CMP"
  short: string;    // One-sentence meaning
  analogy: string;  // Real-life comparison so it sticks
  example: string;  // Tiny assembly example
}

// A dictionary: key (lowercase text) -> lesson card.
export const CONCEPTS: Record<string, Concept> = {
  mov: {
    name: "MOV",
    short: "Copies a value from the right side into the left side.",
    analogy: "Like writing a number from one sticky note onto another.",
    example: "mov eax, 5   ; eax now holds 5",
  },
  cmp: {
    name: "CMP",
    short: "Compares two values by subtracting them, throws the result away, and keeps only the 'flags' (equal? smaller?).",
    analogy: "Like weighing two boxes on a scale: you note which is heavier, but don't change the boxes.",
    example: "cmp eax, 10  ; is eax equal to 10? The answer goes into the flags",
  },
  jmp: {
    name: "JMP",
    short: "Jumps to another place in the code, always.",
    analogy: "Like 'go to page 40' in a choose-your-own-adventure book.",
    example: "jmp end      ; skip everything and go to the label 'end'",
  },
  jz: {
    name: "JZ / JE",
    short: "Jumps only if the last comparison was equal (zero flag set). JE is another name for it.",
    analogy: "Like 'if the password matches, open the door'.",
    example: "cmp eax, 10\njz  correct  ; jump to 'correct' only if eax == 10",
  },
  jnz: {
    name: "JNZ / JNE",
    short: "Jumps only if the last comparison was NOT equal. The opposite of JZ.",
    analogy: "Like 'if the password is wrong, show an error'.",
    example: "cmp eax, 10\njnz wrong    ; jump to 'wrong' if eax != 10",
  },
  call: {
    name: "CALL",
    short: "Runs a function, remembering where to come back to (pushes the return address on the stack).",
    analogy: "Like putting a bookmark in your book before reading a footnote.",
    example: "call check_password",
  },
  test: {
    name: "TEST",
    short: "Checks bits of two values (a bitwise AND) and keeps only the flags. 'test eax, eax' is the classic way to ask 'is eax zero?'.",
    analogy: "Like shaking a box to hear if anything is inside, without opening it.",
    example: "call strcmp\ntest eax, eax   ; did strcmp return 0 (strings equal)?",
  },
  setz: {
    name: "SETZ / SETE",
    short: "Stores 1 in a byte if the last comparison was equal (zero flag set), otherwise 0. A jump-free way to turn a comparison into true/false.",
    analogy: "Like ticking a checkbox instead of walking to a different room.",
    example: "test eax, eax\nsetz al         ; al = 1 if eax was 0, else 0",
  },
  lea: {
    name: "LEA",
    short: "'Load Effective Address': computes an ADDRESS and stores it, without reading what's there. Often loads a pointer to a string.",
    analogy: "Like writing down a house's address instead of going inside.",
    example: "lea rdx, [0x140005050]   ; rdx = address of the secret string",
  },
  push: {
    name: "PUSH",
    short: "Puts a value on top of the stack (a pile of saved values in memory).",
    analogy: "Like putting a plate on top of a pile of plates.",
    example: "push rbp   ; save rbp so we can restore it later",
  },
  pop: {
    name: "POP",
    short: "Takes the top value off the stack and puts it in a register. The opposite of PUSH.",
    analogy: "Like taking the top plate off the pile.",
    example: "pop rbp    ; restore the rbp we saved with push",
  },
  ret: {
    name: "RET",
    short: "Leaves the current function and goes back to the saved return address.",
    analogy: "Like going back to your bookmark after the footnote.",
    example: "ret",
  },
  add: {
    name: "ADD",
    short: "Adds the right value to the left one and keeps the result in the left one.",
    analogy: "Like dropping more coins into a jar: the jar now holds the total.",
    example: "add rax, 1   ; rax is now one bigger. On an address: 'move to the next letter'",
  },
  sub: {
    name: "SUB",
    short: "Subtracts the right value from the left one and keeps the result in the left one.",
    analogy: "Like taking coins out of a jar.",
    example: "sub rsp, 0x20   ; make room on the stack for this function's notes",
  },
  xor: {
    name: "XOR",
    short: "Compares two values bit by bit: where the bits differ the result is 1, where they match it is 0. Doing the same XOR twice gives back the original.",
    analogy: "Like a light with two switches: flip one and the light changes, flip the same one again and it is back as it was.",
    example: "xor eax, 5     ; scramble eax with the key 5 (xor with 5 again to unscramble)\nxor eax, eax   ; a value XORed with itself is 0: a short way to write 'eax = 0'",
  },
  movzx: {
    name: "MOVZX / MOVSX",
    short: "Copies a small value (like one letter) into a bigger register and fills the extra room. MOVZX fills it with zeros; MOVSX keeps the sign.",
    analogy: "Like moving one small item into a big box and stuffing the empty space with paper so nothing old is left inside.",
    example: "movzx eax, byte ptr [rax]   ; take ONE letter from the text that rax points to",
  },
  hex: {
    name: "Hexadecimal (0x...)",
    short: "A way of writing numbers with 16 digits (0-9 then a-f) instead of 10. '0x' in front means 'this is hexadecimal'.",
    analogy: "Like counting eggs in boxes of 16 instead of 10: 0x10 is one full box and no loose eggs, so 16.",
    example: "cmp eax, 0x1f   ; 0x1f = 1 box of sixteen + 15 loose = 31",
  },
  ascii: {
    name: "ASCII (letters as numbers)",
    short: "The table that gives every letter a number, because a computer stores only numbers. 'a' is 0x61, 'b' is 0x62, and so on up to 'z' at 0x7a.",
    analogy: "Like a secret-decoder ring where every letter has a fixed number.",
    example: "cmp al, 0x68   ; is this letter 'h'?  (0x61=a ... 0x68=h)",
  },
};

// Other names learners may type for the same card.
const ALIASES: Record<string, string> = {
  je: "jz",
  jne: "jnz",
  movsx: "movzx",
  hexadecimal: "hex",
  "0x": "hex",
};

// Find a card by name, ignoring capitals and spaces, and accepting the other names above.
export function findConcept(name: string): { key: string; card: Concept } | undefined {
  const typed = name.trim().toLowerCase();
  const key = ALIASES[typed] ?? typed;
  const card = CONCEPTS[key];
  return card ? { key, card } : undefined;
}
