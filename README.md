```text
 █▀█ █▀▀ █ █ █▀▀ █   █▀▀ █▄ █
 █▀▄ ██▄ ▀▄▀ ██▄ █▄▄ ██▄ █ ▀█
 [ Learn reverse engineering step by step, through MCP ]
```

# Revelen

Revelen is an educational MCP server that helps you **learn reverse engineering** with an AI assistant (Claude Code, Cursor, VS Code). Instead of dumping a whole program at once, it shows you one small piece at a time, explains the instructions you meet, and keeps the output compact.

It uses [REA](https://github.com/morluto/rea) with [Ghidra](https://github.com/NationalSecurityAgency/ghidra) to read programs. The AI talks only to Revelen; Revelen decides what to show.

```
Claude / Cursor ──► Revelen (MCP) ──► REA ──► Ghidra ──► lab program
                    explains, compacts,
                    only opens its own labs
```

## Tools

| Tool | What it does |
|---|---|
| `revelen_explain_concept` | Explains an assembly instruction (MOV, CMP, TEST, SETZ, LEA, JZ…) with an analogy and example |
| `revelen_find_strings` | Searches the text stored inside a lab program and shows where it lives |
| `revelen_show_function` | Shows one function's assembly, compacted and labelled with clues you've found |
| `revelen_check_setup` | Checks Node, REA, Ghidra, Java, GCC and the labs, and gives the exact fix for anything missing |

## Token savings

Revelen's optimizer folds standard prologue/epilogue code, shortens addresses to offsets and labels known addresses. It never removes logic (compares, tests, calls, jumps).

Measured on the Level 1 lab (`check_password`): **~1,366 → ~101 tokens, about 93% smaller** than REA's raw JSON. Token counts are estimated at ~4 characters per token; results vary by program.

## Requirements (Windows x64)

- Node.js 22.19+ or 24.11+
- [REA](https://github.com/morluto/rea): `npm install --global rea-agents`
- Ghidra **12.1.4** and a full **JDK 21** (e.g. Eclipse Temurin)
- GCC to build the labs (e.g. `winget install BrechtSanders.WinLibs.POSIX.UCRT`)

Set these environment variables (adjust the paths):

```powershell
[Environment]::SetEnvironmentVariable("GHIDRA_INSTALL_DIR", "C:\tools\ghidra_12.1.4_PUBLIC", "User")
[Environment]::SetEnvironmentVariable("REA_ANALYSIS_PROVIDER", "ghidra", "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-21...", "User")
```

Check with `rea doctor`: the `ghidra` checks should be `ok: true`.

## Install

```powershell
git clone https://github.com/ahmedi56/Revelen.git
cd Revelen
npm install
npm run build
gcc labs\level1_strings.c -o labs\level1_strings.exe
npm test
```

## Connect to your AI assistant

**Claude Code:**

```powershell
claude mcp add revelen -- node C:\path\to\Revelen\dist\index.js
```

**Cursor** (`.cursor/mcp.json`):

```json
{ "mcpServers": { "revelen": { "command": "node", "args": ["C:\\path\\to\\Revelen\\dist\\index.js"] } } }
```

Then ask: *"Using Revelen, search the level1_strings lab for text and explain what you find."*

## Claude Code plugin

The repository is also a Claude Code plugin. It starts Revelen for you (through `npx`) and adds two skills:

| Skill | What it does |
|---|---|
| `reverse-engineer` | Leads an investigation of a lab one step at a time: clues, one function, one question |
| `explain-simply` | Explains any instruction or idea with an everyday analogy and small steps |

```text
/plugin marketplace add ahmedi56/Revelen
/plugin install revelen@revelen
```

Then ask: *"Help me reverse engineer the level1_strings lab."*

When Revelen runs through `npx` it lives in a temporary folder, so keep your built labs in a folder of your own and point `REVELEN_LABS_DIR` at it:

```powershell
[Environment]::SetEnvironmentVariable("REVELEN_LABS_DIR", "C:\path\to\Revelen\labs", "User")
```

## Project anatomy

```
src/index.ts            🧠 MCP server: the tools Claude can call
src/bridge/rea.ts       ✋ runs REA as a child process, parses its JSON
src/optimizer/compact.ts 🫁 compacts output without dropping logic
src/tutor/concepts.ts   🎓 instruction explanations
src/labs.ts             🚪 only opens programs inside labs/
labs/                   🏋️ practice programs (source only; build them yourself)
test/                   ✅ smoke tests with a fake REA + optimizer tests
.claude-plugin/         🔌 plugin manifest + marketplace entry
skills/                 📚 the two teaching skills (plain Markdown)
```

## Roadmap

- [ ] Guided lessons with quizzes and saved progress
- [ ] More labs (logic branches, simple encodings)
- [x] `npx revelen` package
- [x] Claude Code plugin with two skills

## Responsible use

Revelen is for learning on its own lab programs and on software you own or are authorized to analyze. Follow the licenses of the tools it uses (REA, Ghidra) and of any software you study.

## License

MIT
