import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { execSync } from "node:child_process";

const params = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
});

// NOTE: This tool intentionally uses shell execution — the agent model
// decides what commands to run. This is a core capability of the agent.
export const bashTool: AgentTool<typeof params> = {
  name: "bash",
  label: "Bash",
  description: "Execute a shell command and return its output.",
  parameters: params,
  execute: async (_id, { command }) => {
    try {
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { command, exitCode: 0 },
      };
    } catch (err: any) {
      const output = (err.stdout || "") + (err.stderr || "");
      throw new Error(`Command failed (exit ${err.status}): ${output.slice(0, 2000)}`);
    }
  },
};
