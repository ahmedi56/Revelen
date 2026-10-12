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
  ret: {
    name: "RET",
    short: "Leaves the current function and goes back to the saved return address.",
    analogy: "Like going back to your bookmark after the footnote.",
    example: "ret",
  },
};
