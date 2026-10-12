// 1. Import what we need.
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
// ".js" even though the file is .ts: we write the name it will have AFTER compiling.
import { CONCEPTS } from "./tutor/concepts.js";

// 2. Create the server with a name and version (Claude sees these).
const server = new McpServer({ name: "revelen", version: "0.1.0" });

// 3. Register our first tool: name, rules, and what it does.
server.registerTool(
  "revelen_explain_concept",
  {
    // Claude reads this to decide WHEN to use the tool.
    description:
      "Explain an assembly instruction (like MOV, CMP, JZ) in simple words, with an analogy and example. " +
      "Use this when the learner asks what an instruction means.",
    // zod: we accept exactly one text field called "concept".
    inputSchema: z.object({
      concept: z.string().describe("The instruction to explain, e.g. 'cmp' or 'jz'"),
    }),
  },
  // 4. The handler: runs when Claude calls the tool.
  async ({ concept }) => {
    const key = concept.trim().toLowerCase(); // "  CMP " -> "cmp"
    const card = CONCEPTS[key];

    if (!card) {
      const known = Object.keys(CONCEPTS).join(", ");
      return {
        content: [{ type: "text", text: `I don't have a lesson for "${concept}" yet. I know: ${known}.` }],
        isError: true,
      };
    }

    const lesson =
      `## ${card.name}\n\n` +
      `**Meaning:** ${card.short}\n\n` +
      `**Think of it like:** ${card.analogy}\n\n` +
      `**Example:**\n${card.example}`;

    return { content: [{ type: "text", text: lesson }] };
  }
);

// 5. Connect to Claude through stdin/stdout.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Revelen is running"); // stderr, NEVER console.log!
}

main();
