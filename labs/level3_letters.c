#include <stdio.h>   // printf, fgets: talking to the terminal
#include <string.h>  // strlen, strcspn: working with text

// Level 3: the secret is a word, but it is not stored as text.
// The program checks your word one letter at a time. To a computer a letter
// is just a number (its ASCII code: 'a' is 0x61, 'b' is 0x62...), so the
// letters hide inside the instructions as numbers, like the PIN in Level 2.
// Searching the program's text will not find the word.

// Returns 1 if the word is right, 0 if wrong.
int check_word(const char *word) {
    if (strlen(word) != 4) return 0;
    // In assembly, four times: load one letter, CMP it with a number, jump.
    if (word[0] != 'o') return 0;
    if (word[1] != 'p') return 0;
    if (word[2] != 'e') return 0;
    if (word[3] != 'n') return 0;
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
        printf("Access granted. You read the letters!\n");
    } else {
        printf("Wrong word.\n");
    }
    return 0;
}
