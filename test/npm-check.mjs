// Checks the PUBLISHED package: downloads revelen from npm with npx,
// connects like Claude would, lists the tools and asks one question.
// Run from the Revelen folder:  node test/npm-check.mjs
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const isWindows = process.platform === "win32";
console.log("Downloading and starting revelen from npm (can take 30s the first time)...");

const client = new Client({ name: "revelen-npm-check", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    // On Windows, npx is a .cmd file, so it runs through cmd.exe.
    command: isWindows ? "cmd.exe" : "npx",
    args: isWindows ? ["/c", "npx", "-y", "revelen@latest"] : ["-y", "revelen@latest"],
    // Start in the home folder so npx doesn't pick up the local Revelen project.
    cwd: os.homedir(),
    // Keep this check out of the learner's real diary (~/.revelen/progress.json).
    env: { ...process.env, REVELEN_HOME: mkdtempSync(path.join(os.tmpdir(), "revelen-check-")) },
  })
);

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log("✓ Tools found:", tools.join(", "));

const answer = await client.callTool({ name: "revelen_explain_concept", arguments: { concept: "test" } });
console.log("✓ Answer received:\n");
console.log(answer.content[0].text);

await client.close();
console.log("\nThe published npm package works 🎉");
