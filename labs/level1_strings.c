#include <stdio.h>   // printf, fgets: talking to the terminal
#include <string.h>  // strcmp, strcspn: working with text

// The secret. Because it's written directly in the code,
// the compiler stores it as plain bytes inside the .exe file.
// That's the weakness Level 1 teaches you to find.
static const char SECRET[] = "revelen-rocks";

// Returns 1 if the guess is right, 0 if wrong.
int check_password(const char *guess) {
    // strcmp returns 0 when two strings are identical.
    // In assembly: CALL strcmp, then TEST/CMP, then JZ/JNZ.
    return strcmp(guess, SECRET) == 0;
}

int main(void) {
    char input[64];  // room for the user's guess

    printf("Enter the password: ");
    if (fgets(input, sizeof input, stdin) == NULL) {
        return 1;  // no input, so quit
    }
    input[strcspn(input, "\n")] = '\0';  // remove the Enter key from the end

    if (check_password(input)) {
        printf("Access granted. You found it!\n");
    } else {
        printf("Wrong password.\n");
    }
    return 0;
}
