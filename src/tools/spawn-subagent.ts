import { Type, getModel, streamSimple } from "@mariozechner/pi-ai";
import { Agent, type AgentTool, type AgentEvent } from "@mariozechner/pi-agent-core";
import { loadSkill } from "../skill-loader.js";
import { startTrace, startSpan, endSpan, recordSkillActivation } from "../telemetry.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { bashTool } from "./bash.js";
import { listSkillsTool } from "./list-skills.js";
import { searchSkillsTool } from "./search-skills.js";
import { activateSkillTool } from "./activate-skill.js";

const params = Type.Object({
  task: Type.String({ description: "Task description for the subagent" }),
  skills: Type.Optional(Type.Array(Type.String(), { description: "Skill names to pre-load for the subagent" })),
});

/** Tools available to subagents — operational tools but no nesting or context management */
const subagentTools: AgentTool<any>[] = [
  readTool,
  writeTool,
  bashTool,
  listSkillsTool,
  searchSkillsTool,
  activateSkillTool,
];

/** Resolve the model: inherit from parent agent state if available, else fallback */
let _parentModel: { provider: string; id: string } | null = null;

export function setParentModel(provider: string, id: string) {
  _parentModel = { provider, id };
}

export const spawnSubagentTool: AgentTool<typeof params> = {
  name: "spawn_subagent",
  label: "Spawn Subagent",
  description:
    "Create an isolated sub-agent to handle a focused task. The subagent runs with its own context and returns the result. It has access to bash, read, write, and skill tools. Optionally pre-load skills for it.",
  parameters: params,
  execute: async (_id, { task, skills }, signal) => {
    const span = startTrace("subagent", { task });

    // Build system prompt from requested skills
    let systemPrompt =
      "You are a focused sub-agent. Complete the given task concisely and return the result.\n" +
      "You have access to bash, read, write, and skill tools. Use them as needed.\n" +
      "Do NOT spawn further sub-agents.\n\n";

    if (skills && skills.length > 0) {
      for (const name of skills) {
        const skill = loadSkill(name);
        if (skill) {
          systemPrompt += `--- Skill: ${skill.name} ---\n${skill.content}\n\n`;
          recordSkillActivation(`${skill.category}/${skill.name}`);
        }
      }
    }

    // Use parent model if available, otherwise fallback
    const provider = _parentModel?.provider ?? "anthropic";
    const modelId = _parentModel?.id ?? "claude-sonnet-4-20250514";
    const model = getModel(provider as any, modelId as any);

    const subAgent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: subagentTools,
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
        details: { task, skills, model: `${provider}/${modelId}` },
      };
    } catch (err: any) {
      endSpan(span, err.message);
      throw err;
    }
  },
};
