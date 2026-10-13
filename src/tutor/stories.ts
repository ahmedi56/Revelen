// 📖 THE STORYBOOK: each lab told as a real-life security job, in plain words.
//
// A story never shows machine code unless the learner asks for it.
// Everything a step needs was recorded in advance from the lab program, so a
// story answers at once: no Ghidra, no waiting.
//
// Writing rules for stories: short sentences, everyday words, one new idea
// per step. Many learners are not native English speakers.

export interface StoryStep {
  title: string;
  say: string; // what to tell the learner
  run?: boolean; // true = the learner runs the lab program in this step
  show?: string; // something to show exactly as written (recorded from the lab)
  ask: string; // the one question for the learner
  goodAnswer: string; // what a right answer contains. For the teacher only.
  deeper?: string; // the machine-level view. Only if the learner asks for it.
}

export interface Word {
  word: string;
  meaning: string;
}

export interface Story {
  lab: string;
  title: string;
  situation: string; // the real-life job the learner is doing
  words: Word[]; // new words of this level, explained before they are used
  steps: StoryStep[];
  fix: string; // how to defend against what the learner just did
  realNames: string; // what the learner did, in the words professionals use
}

// Told once, before the first level: what this whole thing is.
export const INTRO =
  "WHAT IS REVERSE ENGINEERING?\n" +
  "Normal engineering goes forward: a developer writes code, and the code becomes a finished program.\n" +
  "Reverse engineering goes backward: you only have the finished program, and you work out what is inside it and how it works.\n" +
  "It is like tasting a dish and working out the recipe, when nobody gave you the recipe.\n\n" +
  "WHO DOES THIS, AND WHY?\n" +
  "Security testers do it to find weak points before a thief does. Researchers do it to understand viruses. " +
  "Thieves do it too, and that is exactly why the people who build software need to understand it.\n" +
  "In Revelen you are always the tester. You only open practice programs that were made for this.\n\n" +
  "WORDS YOU WILL MEET\n" +
  "- Program file: the finished program you can start, for example a file ending in .exe.\n" +
  "- Source code: the text the developer wrote. A tester usually does not have it.\n" +
  "- Secret: something the developer wants to keep hidden, like a password.\n" +
  "- Instruction: one small order a program gives the computer, like \"compare these two numbers\".\n" +
  "- Tester: you. Someone who looks for weak points so they can be fixed.\n\n" +
  "THE FOUR LEVELS\n" +
  "1. A password stored as plain text.\n" +
  "2. A number hidden inside an instruction.\n" +
  "3. A word hidden as a row of numbers.\n" +
  "4. A word hidden behind a disguise.\n" +
  "Each level is a developer trying to hide a secret a little better than the one before. Each time, you find it.\n\n" +
  "WHAT YOU CAN DO AFTER THE FOUR LEVELS\n" +
  "- Explain why a secret inside a program or a web page is never safe, and what to do instead.\n" +
  "- Read a simple check inside a program and say what it compares.\n" +
  "- Read numbers the way programs write them, and know that letters are numbers too.\n" +
  "- Notice the same mistakes in your own code.\n" +
  "You will not be a security expert yet: that takes years of practice. " +
  "You will have taken the same first steps every expert took, and you will know if you want to go further.";

const LETTER_TABLE =
  "a 0x61   b 0x62   c 0x63   d 0x64   e 0x65   f 0x66   g 0x67\n" +
  "h 0x68   i 0x69   j 0x6a   k 0x6b   l 0x6c   m 0x6d   n 0x6e\n" +
  "o 0x6f   p 0x70   q 0x71   r 0x72   s 0x73   t 0x74   u 0x75\n" +
  "v 0x76   w 0x77   x 0x78   y 0x79   z 0x7a";

const level1: Story = {
  lab: "level1_strings",
  title: "The password inside the program",
  situation:
    "Sam owns a small shop. A developer made a program for Sam's cash register. " +
    "The program asks for a password before it opens.\n" +
    "The developer wrote the password inside the program and thought: " +
    "\"Nobody can read a program file, so the password is safe.\"\n" +
    "Sam is not sure. Sam hires you as a security tester. " +
    "Your job: find out if a stranger could get the password. " +
    "If you can get it, a thief can too, and you will tell Sam how to fix it.",
  words: [
    { word: "Program file", meaning: "the finished program you can start. Here it is level1_strings.exe." },
    { word: "Text", meaning: "letters and sentences, like the ones a program prints on the screen." },
  ],
  steps: [
    {
      title: "Watch the program",
      say:
        "A tester does not start by opening things. A tester starts by watching. " +
        "Start the program and type any password you like. Look at what it says.",
      run: true,
      ask: "What does the program ask you for? And what does it say when your guess is wrong?",
      goodAnswer: 'It asks for a password. When the guess is wrong it says "Wrong password."',
    },
    {
      title: "A program carries its sentences with it",
      say:
        "The program printed a sentence on your screen. That sentence has to come from somewhere. " +
        "It is stored inside the program file.\n" +
        "Think of a program file as a suitcase. It carries its instructions, " +
        "and it also carries every sentence it will ever say.\n" +
        "We looked in the suitcase for sentences with the word \"password\". We found two.",
      show: '"Enter the password: "\n"Wrong password."',
      ask:
        "To know if your guess is right, the program must compare it with the real password. " +
        "So where does the real password have to be?",
      goodAnswer: "Inside the program file too, in the same suitcase as the sentences.",
    },
    {
      title: "Empty the suitcase",
      say:
        "You are right, so let us look. Things that are packed together stay together. " +
        "Here is everything that is stored right next to the two sentences we found.",
      show:
        '"__register_frame_info"\n' +
        '"__deregister_frame_info"\n' +
        '"revelen-rocks"\n' +
        '"Enter the password: "\n' +
        '"Access granted. You found it!"',
      ask:
        "Two of these are sentences the program says to you. Two are long technical names that come with every program. " +
        "One is left. Which one, and what do you think it is?",
      goodAnswer: '"revelen-rocks", and it is probably the password.',
    },
    {
      title: "Prove it",
      say:
        "A tester never says \"I think\". A tester proves it. " +
        "Start the program again. When it asks, type what you found and press Enter.",
      run: true,
      ask: "What does the program say after you type it?",
      goodAnswer: '"Access granted. You found it!" Then confirm the password with revelen_check_solution.',
      deeper:
        "Inside the program there is a small part named check_password. It does three things:\n" +
        "1. It takes the text you typed.\n" +
        '2. It takes the text stored in the suitcase ("revelen-rocks").\n' +
        "3. It asks a helper: are these two texts the same? If yes, the program says Access granted.\n" +
        "The machine lines for those three things are:\n" +
        "  MOV qword ptr [RBP + 0x10], RCX    (keep what the person typed)\n" +
        "  LEA RDX, [0x140005050]             (point at the stored password)\n" +
        "  CALL 0x140003340                   (ask the helper to compare them)\n" +
        "You do not need to read these lines to do this job. They are here if you are curious.",
    },
    {
      title: "Explain the danger to Sam",
      say:
        "You found the password in a few minutes, and you never guessed. " +
        "You only read what was already inside the file. A thief can do exactly the same.\n" +
        "The developer's mistake was to believe that a program file cannot be read. It can.",
      ask:
        "The same mistake happens on websites. Everything you write in a page's JavaScript is sent to the visitor's browser. " +
        "So if you put a password or a secret key in your JavaScript, who can read it?",
      goodAnswer: "Every visitor. Anyone can open the page's code in the browser and read it.",
    },
  ],
  fix:
    "How Sam's developer should fix it:\n" +
    "1. Never put the secret inside the program. Anything inside the file can be read.\n" +
    "2. Keep only a fingerprint of the password in the program. A fingerprint (the real name is a hash) " +
    "is made from the password by a one-way calculation: you can check a guess against it, " +
    "but you cannot turn it back into the password.\n" +
    "3. Even better, check the password on a server. The stranger has the program, but not the server.\n" +
    "This is not only about cash registers. Passwords and secret keys left inside apps and websites " +
    "are one of the most common ways attackers get in.",
  realNames:
    "You only had the finished program, not the developer's code, and you worked out what was inside. That is reverse engineering.\n" +
    "- \"Looking in the suitcase for sentences\" is called searching the program's strings. A string is a piece of text.\n" +
    "- \"A secret written inside the program\" is called a hard-coded secret.\n" +
    "- \"A fingerprint of the password\" is called a hash.",
};

const level2: Story = {
  lab: "level2_pin",
  title: "The number that is not in the suitcase",
  situation:
    "Lina runs a small gym. The door opens when you type a PIN into a program. A PIN is a secret number.\n" +
    "Lina's developer heard what happened to Sam and said: " +
    "\"I did not use a password. I used a number. A number is not stored as a sentence, " +
    "so nobody will find it by searching the sentences.\"\n" +
    "Lina hires you to test that.",
  words: [
    { word: "PIN", meaning: "a secret number, like the code of a bank card." },
    { word: "Instruction", meaning: "one small order a program gives the computer, like \"compare these two numbers\". A program is a long list of them." },
    { word: "Hexadecimal", meaning: "another way of writing numbers, used inside programs. You will learn to read it in this level." },
  ],
  steps: [
    {
      title: "Watch the program",
      say: "Same start as always: watch first. Start the program and type any number.",
      run: true,
      ask: "What does it ask for, and what does it say when you are wrong?",
      goodAnswer: 'It asks for a PIN. It says "Wrong PIN."',
    },
    {
      title: "Try what worked last time",
      say:
        "In Level 1 the secret was a sentence in the suitcase. A good tester tries the easy thing first. " +
        "Here are the sentences this program carries.",
      show:
        '"Enter the PIN: "\n' +
        '"That is not a number."\n' +
        '"Access granted. You read the number!"\n' +
        '"Wrong PIN."',
      ask: "Is the PIN in this list? Was the developer right about that?",
      goodAnswer: "No, the PIN is not there. The developer was right: a number is not stored as a sentence.",
    },
    {
      title: "The other thing in the suitcase",
      say:
        "The suitcase holds two kinds of things: the sentences, and the instructions. " +
        "Instructions are the small orders the program gives the computer, one after another.\n" +
        "The program has a small part whose only job is to check the PIN. " +
        "It has just two instructions. Here they are in plain words.",
      show:
        "1. Keep the number the person typed.\n" +
        "2. Compare that number with 0x1337. Remember if they are the same.",
      ask: "Which of the two instructions holds the secret?",
      goodAnswer: "The second one. The secret is the 0x1337 it compares with.",
      deeper:
        "The real machine lines for those two instructions are:\n" +
        "  MOV dword ptr [RBP + 0x10], ECX       (keep the number the person typed)\n" +
        "  CMP dword ptr [RBP + 0x10], 0x1337    (compare it with 0x1337)\n" +
        "MOV means \"put\" and CMP means \"compare\". [RBP + 0x10] is just the name of the place where the typed number is kept.",
    },
    {
      title: "Try the number",
      say: "It looks like the PIN is 1337. Test it: start the program and type 1337.",
      run: true,
      ask: "What happens? And what do you think the \"0x\" in front of the number means?",
      goodAnswer: 'It says "Wrong PIN." So 0x1337 is not the same as 1337: the 0x changes how the number is read.',
    },
    {
      title: "Two ways to write the same number",
      say:
        "\"0x\" means: this number is written in hexadecimal.\n" +
        "We write numbers with ten signs: 0 to 9. Hexadecimal uses sixteen signs: 0 to 9, then a, b, c, d, e, f.\n" +
        "It is still an ordinary number, only written differently. Like 12, \"twelve\" and XII: three ways to write one amount.\n" +
        "In our numbers, each place is worth ten times the place to its right: 1, 10, 100, 1000.\n" +
        "In hexadecimal, each place is worth sixteen times the place to its right: 1, 16, 256, 4096.",
      show: "0x1337  =  1 x 4096   +   3 x 256   +   3 x 16   +   7 x 1",
      ask: "Work out the four parts and add them up. A calculator is fine. What number do you get?",
      goodAnswer: "4096 + 768 + 48 + 7 = 4919.",
    },
    {
      title: "Prove it",
      say: "Start the program again and type your number.",
      run: true,
      ask: "What does it say?",
      goodAnswer: '"Access granted. You read the number!" Then confirm the number with revelen_check_solution.',
    },
    {
      title: "Explain the danger to Lina",
      say:
        "The developer did not protect the PIN. The developer only moved it to a place where fewer people look, " +
        "and it was written in a way fewer people read.",
      ask: "The developer says: \"Next time I will hide it even better.\" Is hiding the right idea?",
      goodAnswer: "No. Whatever is inside the program can be found. Hiding only makes it take a little longer.",
    },
  ],
  fix:
    "What to tell Lina:\n" +
    "1. Hiding a secret is not the same as protecting it. If the secret is inside the program, a patient person will find it.\n" +
    "2. The fix is the same as for Sam: keep the secret out of the program. Check it on a server, or keep only a fingerprint.\n" +
    "3. A short PIN has a second problem. A PIN of four digits has only 10,000 possibilities, and a program can try them all in seconds. " +
    "Real systems block you after a few wrong tries.",
  realNames:
    "- The \"list of instructions\" is called machine code. Shown in a form people can read, it is called assembly.\n" +
    "- Turning a program file back into readable instructions is called disassembly. That is what Ghidra, the tool behind Revelen, does.\n" +
    "- The \"small part whose only job is to check the PIN\" is called a function.\n" +
    "- Hiding a secret and hoping nobody looks is called security through obscurity. Professionals consider it a mistake.",
};

const level3: Story = {
  lab: "level3_letters",
  title: "The word that is not a word",
  situation:
    "Omar made a small game. A secret word unlocks a bonus level.\n" +
    "Omar read about Sam and Lina and said: \"I will not store the word as a sentence, and I will not store one number. " +
    "My program will check the word one letter at a time.\"\n" +
    "Omar asks you to test it before the game comes out.",
  words: [
    { word: "Letter code", meaning: "the number a computer uses for a letter. Computers only store numbers, so every letter has one." },
    { word: "ASCII", meaning: "the name of the table that says which number belongs to which letter. You say it \"ass-kee\"." },
  ],
  steps: [
    {
      title: "Watch the program",
      say: "Watch first. Start the program and type any word.",
      run: true,
      ask: "What does it ask for, and what does it say when you are wrong?",
      goodAnswer: 'It asks for a secret word. It says "Wrong word."',
    },
    {
      title: "The easy thing first",
      say: "Here are the sentences this program carries.",
      show: '"Enter the secret word: "\n"Access granted. You read the letters!"\n"Wrong word."',
      ask: "The secret word is not there. Level 2 taught you where else a secret can be. Where do we look?",
      goodAnswer: "In the instructions, the small orders of the program.",
    },
    {
      title: "Read the instructions",
      say: "This is the part of the program that checks the word, in plain words.",
      show:
        "1. Count the letters of the word. If it does not have 4 letters, answer \"wrong\".\n" +
        "2. Take letter 1. Compare it with 0x6f.\n" +
        "3. Take letter 2. Compare it with 0x70.\n" +
        "4. Take letter 3. Compare it with 0x65.\n" +
        "5. Take letter 4. Compare it with 0x6e.\n" +
        "If any of these is not the same, answer \"wrong\".",
      ask: "How many letters does the secret word have? And what is strange about instructions 2 to 5?",
      goodAnswer: "4 letters. The strange thing: a letter is compared with a number.",
      deeper:
        "The real machine lines for \"take letter 1 and compare it with 0x6f\" are:\n" +
        "  MOVZX EAX, byte ptr [RAX]    (take one letter of the word)\n" +
        "  CMP AL, 0x6f                 (compare it with 0x6f)\n" +
        "The same two lines come back four times, once for each letter.",
    },
    {
      title: "Letters are numbers",
      say:
        "A computer can only store numbers. So long ago, people agreed on a table: every letter gets a number. " +
        "The table is called ASCII. When you type a letter, the computer really stores its number.\n" +
        "Here is the table for the small letters. The numbers are in hexadecimal, like in Level 2.",
      show: LETTER_TABLE,
      ask: "Instruction 2 compares letter 1 with 0x6f. Find 0x6f in the table. Which letter is it?",
      goodAnswer: "o",
    },
    {
      title: "Read the whole word",
      say: "Now do the same for the other three: 0x70, then 0x65, then 0x6e.",
      show: LETTER_TABLE,
      ask: "What is the secret word?",
      goodAnswer: "open (0x6f o, 0x70 p, 0x65 e, 0x6e n)",
    },
    {
      title: "Prove it",
      say: "Start the program again and type the word.",
      run: true,
      ask: "What does it say?",
      goodAnswer: '"Access granted. You read the letters!" Then confirm the word with revelen_check_solution.',
    },
    {
      title: "Explain it to Omar",
      say: "Omar cut the secret into four pieces and wrote each piece as a number.",
      ask: "Did cutting the secret into pieces make it safe?",
      goodAnswer: "No. It is still inside the program. It only took a little more reading.",
    },
  ],
  fix:
    "What to tell Omar:\n" +
    "1. Cutting a secret into pieces is still hiding, and hiding is not protecting.\n" +
    "2. But ask one more question: what happens if somebody finds it? For a bonus level in a game, not much. " +
    "For Sam's cash register, a lot. Good security matches the protection to the damage.\n" +
    "3. If the secret matters, the rule does not change: keep it out of the program.",
  realNames:
    "- The table of letters and numbers is called ASCII.\n" +
    "- One stored letter takes one byte. A byte is the small box a computer stores one small number in.\n" +
    "- Checking a secret piece by piece instead of all at once is a simple form of obfuscation: making code harder to read on purpose.",
};

const level4: Story = {
  lab: "level4_xor",
  title: "The disguise",
  situation:
    "Nora sells an app. A secret word unlocks the paid part.\n" +
    "Nora read all three stories and said: \"I will disguise the letters. My program scrambles what you type with a key, " +
    "and compares the result with scrambled numbers. The real letters are nowhere in my program.\"\n" +
    "This is the strongest idea so far. Nora asks you to test it.",
  words: [
    { word: "Scramble", meaning: "to mix something up so it cannot be read, in a way that can be undone." },
    { word: "Key", meaning: "the number used to scramble. With the same key you can unscramble." },
    { word: "XOR", meaning: "the name of the scrambling method used here. You say it \"ex-or\"." },
    { word: "Bit", meaning: "a switch that is 0 (off) or 1 (on). Inside a computer every number is a row of bits." },
  ],
  steps: [
    {
      title: "Watch the program",
      say: "Watch first. Start the program and type any word.",
      run: true,
      ask: "What does it ask for, and what does it say when you are wrong?",
      goodAnswer: 'It asks for a secret word. It says "Wrong word."',
    },
    {
      title: "Read the instructions",
      say:
        "You know the way by now. The sentences in the suitcase do not hold the word, so we go to the instructions. " +
        "This is the part that checks the word, in plain words.",
      show:
        "1. Put the number 5 aside. Call it the key.\n" +
        "2. Count the letters of the word. If it does not have 4 letters, answer \"wrong\".\n" +
        "3. Take letter 1. Scramble it with the key. Compare the result with 0x67.\n" +
        "4. Take letter 2. Scramble it with the key. Compare the result with 0x7c.\n" +
        "5. Take letter 3. Scramble it with the key. Compare the result with 0x71.\n" +
        "6. Take letter 4. Scramble it with the key. Compare the result with 0x60.\n" +
        "If any of these is not the same, answer \"wrong\".\n\n" +
        "The letter table again:\n" +
        LETTER_TABLE,
      ask:
        "In Level 3, the numbers were the letters. Here 0x67 is the letter g in the table. " +
        "Is the first letter of the secret word g? Why, or why not?",
      goodAnswer: "No. 0x67 is what the letter looks like after scrambling. The real letter is something else.",
      deeper:
        "The real machine lines for \"take letter 1, scramble it, compare\" are:\n" +
        "  MOV byte ptr [RBP + -0x1], 0x5    (put the key 5 aside)\n" +
        "  MOVZX EAX, byte ptr [RAX]         (take one letter of the word)\n" +
        "  XOR EAX, EDX                      (scramble it with the key)\n" +
        "  CMP EAX, 0x67                     (compare the result with 0x67)",
    },
    {
      title: "How the scrambling works",
      say:
        "The scrambling method is called XOR. It works on bits. A bit is a switch: 0 is off, 1 is on. " +
        "Every number is a row of these switches.\n" +
        "XOR puts two rows one above the other and looks at each pair of switches. " +
        "If the two are the same, it writes 0. If they are different, it writes 1.\n" +
        "XOR has one special power: do it twice with the same key and you are back where you started. " +
        "It is like pressing a light switch twice.\n" +
        "So to remove the disguise, we XOR the scrambled number with the key again.",
      show:
        "scrambled letter 0x67 :  0110 0111\n" +
        "the key 5             :  0000 0101\n" +
        "different = 1         :  0110 0010   which is 0x62",
      ask: "Find 0x62 in the letter table. What is the real first letter?",
      goodAnswer: "b",
    },
    {
      title: "Remove the disguise from the rest",
      say:
        "Three letters are left. Do the same for each one: write the key under it, and where the two switches are different, write 1.\n" +
        "You can also use the Windows Calculator: choose Programmer mode, and it has an Xor button.\n" +
        "One tip for reading the result: each group of four switches is one hexadecimal sign. " +
        "0110 is 6, 0111 is 7, 0100 is 4, 0101 is 5, 1001 is 9.",
      show:
        "letter 2:  0x7c  =  0111 1100\n" +
        "letter 3:  0x71  =  0111 0001\n" +
        "letter 4:  0x60  =  0110 0000\n" +
        "the key :  5     =  0000 0101\n\n" +
        LETTER_TABLE,
      ask: "What are the three real letters, and what is the whole word?",
      goodAnswer: "0x79 y, 0x74 t, 0x65 e. With the first letter b, the word is byte.",
    },
    {
      title: "Prove it",
      say: "Start the program again and type the word.",
      run: true,
      ask: "What does it say?",
      goodAnswer: '"Access granted. You undid the disguise!" Then confirm the word with revelen_check_solution.',
    },
    {
      title: "Explain it to Nora",
      say: "Nora was right about one thing: the real letters were nowhere in her program. You still found the word.",
      ask: "What did Nora leave inside the program that let you undo the disguise?",
      goodAnswer: "The key (the number 5), and the instructions that show how the scrambling is done.",
    },
  ],
  fix:
    "What to tell Nora:\n" +
    "1. Scrambling a secret and leaving the key in the same program is like locking a door and leaving the key under the mat.\n" +
    "2. Real scrambling, called encryption, is strong only when the key is kept somewhere the attacker cannot reach.\n" +
    "3. All four developers made the same mistake in four different ways. The one rule to remember: " +
    "anything inside a program that you give to people can be read by those people. " +
    "Keep secrets on a server you control, and put in the program only what is safe to be seen.\n" +
    "This rule also covers websites and phone apps: a secret key inside your JavaScript or your app is not a secret.",
  realNames:
    "- The scrambling method really is called XOR. It is one of the basic operations of every computer.\n" +
    "- Scrambling with a key is called encryption when it is done well. Done like Nora did, with the key next to it, it is only obfuscation.\n" +
    "- What you did, working backward from scrambled values and a key to the original, is how analysts read hidden text in real malicious programs.",
};

export const STORIES: Story[] = [level1, level2, level3, level4];

export function findStory(lab: string): Story | undefined {
  return STORIES.find((story) => story.lab === lab);
}
