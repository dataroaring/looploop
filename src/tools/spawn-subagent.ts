import { Type, getModel, streamSimple } from "@mariozechner/pi-ai";
import { Agent, type AgentTool, type AgentEvent } from "@mariozechner/pi-agent-core";
import { loadSkill } from "../skill-loader.js";
import { startTrace, startSpan, endSpan, recordSkillActivation } from "../telemetry.js";

const params = Type.Object({
  task: Type.String({ description: "Task description for the subagent" }),
  skills: Type.Optional(Type.Array(Type.String(), { description: "Skill names to pre-load for the subagent" })),
});

export const spawnSubagentTool: AgentTool<typeof params> = {
  name: "spawn_subagent",
  label: "Spawn Subagent",
  description: "Create an isolated sub-agent to handle a focused task. The subagent runs with its own context and returns the result. Optionally pre-load skills for it.",
  parameters: params,
  execute: async (_id, { task, skills }, signal) => {
    const span = startTrace("subagent", { task });

    // Build system prompt from requested skills
    let systemPrompt = "You are a focused sub-agent. Complete the given task concisely.\n\n";
    if (skills && skills.length > 0) {
      for (const name of skills) {
        const skill = loadSkill(name);
        if (skill) {
          systemPrompt += `--- Skill: ${skill.name} ---\n${skill.content}\n\n`;
          recordSkillActivation(`${skill.category}/${skill.name}`);
        }
      }
    }

    const model = getModel("anthropic", "claude-sonnet-4-20250514");

    const subAgent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: [],
      },
      streamFn: streamSimple,
    });

    let result = "";
    subAgent.subscribe((event: AgentEvent) => {
      if (
        event.type === "message_update" &&
        "assistantMessageEvent" in event &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        result += event.assistantMessageEvent.delta;
      }
    });

    try {
      await subAgent.prompt(task);
      endSpan(span);
      return {
        content: [{ type: "text", text: result || "(subagent produced no output)" }],
        details: { task, skills },
      };
    } catch (err: any) {
      endSpan(span, err.message);
      throw err;
    }
  },
};
