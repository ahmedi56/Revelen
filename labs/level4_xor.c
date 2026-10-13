#include <stdio.h>   // printf, fgets: talking to the terminal
#include <string.h>  // strlen, strcspn: working with text

// Level 4: the secret wears a disguise.
// The program never contains the real letters. It scrambles each letter you
// type with XOR and a key, then compares the result with a scrambled value.
// To find the word you must undo the scrambling yourself.
// What makes that possible: XOR undoes itself. (letter XOR key) XOR key == letter.

// Returns 1 if the word is right, 0 if wrong.
int check_word(const char *word) {
    // Kept in a variable so the compiler really performs the XOR in the program,
    // instead of working the answer out in advance.
    unsigned char key = 5;

    if (strlen(word) != 4) return 0;
    // In assembly, four times: load a letter, XOR it with the key, CMP, jump.
    if ((word[0] ^ key) != 0x67) return 0;
    if ((word[1] ^ key) != 0x7c) return 0;
    if ((word[2] ^ key) != 0x71) return 0;
    if ((word[3] ^ key) != 0x60) return 0;
    return 1;
}

int main(void) {
    char input[64];  // room for the user's guess

    printf("Enter the secret word: ");
    if (fgets(input, sizeof input, stdin) == NULL) {
        return 1;  // no input, so quit
    }
    input[strcspn(input, "\n")] = '\0';  // remove the Enter key from the end

    if (check_word(input)) {
        printf("Access granted. You undid the disguise!\n");
    } else {
        printf("Wrong word.\n");
    }
    return 0;
}
