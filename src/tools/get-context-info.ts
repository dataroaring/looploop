import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getContextStats } from "../telemetry.js";

const params = Type.Object({});

export const getContextInfoTool: AgentTool<typeof params> = {
  name: "get_context_info",
  label: "Context Info",
  description: "Get current context statistics: token usage, message count, tool call counts, active skills, compression events, and average LLM latency.",
  parameters: params,
  execute: async () => {
    const stats = getContextStats();
    const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
    const toolSummary = Object.entries(stats.toolCalls)
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");

    const text = [
      `Messages: ${stats.messageCount}`,
      `Total tokens: ${totalTokens.toLocaleString()} (in: ${stats.totalInputTokens.toLocaleString()}, out: ${stats.totalOutputTokens.toLocaleString()})`,
      `Total cost: $${stats.totalCost.toFixed(4)}`,
      `LLM calls: ${stats.llmCalls}`,
      `Avg latency: ${stats.avgLatencyMs}ms per LLM call`,
      `Active skills: ${stats.activeSkills.length > 0 ? stats.activeSkills.join(", ") : "none"}`,
      `Compression events: ${stats.compressionEvents}`,
      `Tool calls: ${toolSummary || "none"}`,
    ].join("\n");

    return { content: [{ type: "text", text }], details: stats };
  },
};
