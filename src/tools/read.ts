import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import fs from "node:fs";

const params = Type.Object({
  path: Type.String({ description: "File path to read" }),
});

export const readTool: AgentTool<typeof params> = {
  name: "read",
  label: "Read File",
  description: "Read a file's contents and return its text.",
  parameters: params,
  execute: async (_id, { path: filePath }) => {
    const content = fs.readFileSync(filePath, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: { path: filePath, size: content.length },
    };
  },
};
