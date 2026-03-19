import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import fs from "node:fs";
import path from "node:path";

const params = Type.Object({
  path: Type.String({ description: "File path to write" }),
  content: Type.String({ description: "Content to write to the file" }),
});

export const writeTool: AgentTool<typeof params> = {
  name: "write",
  label: "Write File",
  description: "Write content to a file. Creates parent directories if needed.",
  parameters: params,
  execute: async (_id, { path: filePath, content }) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    return {
      content: [{ type: "text", text: `Written ${content.length} bytes to ${filePath}` }],
      details: { path: filePath, size: content.length },
    };
  },
};
