#include <stdio.h>   // printf, scanf: talking to the terminal

// Level 2: the secret is a NUMBER, not text.
// Numbers are not stored as readable strings, so searching the program's
// text finds nothing. The number sits inside an instruction instead, and
// the disassembler shows it in hexadecimal (base 16).

// Returns 1 if the PIN is right, 0 if wrong.
int check_pin(int pin) {
    // In assembly: CMP with a number written in hex, then a jump or SETZ.
    return pin == 4919;
}

int main(void) {
    int pin = 0;

    printf("Enter the PIN: ");
    if (scanf("%d", &pin) != 1) {
        printf("That is not a number.\n");
        return 1;
    }

    if (check_pin(pin)) {
        printf("Access granted. You read the number!\n");
    } else {
        printf("Wrong PIN.\n");
    }
    return 0;
}
