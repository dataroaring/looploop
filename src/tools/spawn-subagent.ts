import fs from "node:fs";
import path from "node:path";
import { Type, getModel, streamSimple, type AssistantMessage } from "@mariozechner/pi-ai";
import { Agent, type AgentTool, type AgentEvent } from "@mariozechner/pi-agent-core";
import { loadSkill } from "../skill-loader.js";
import { startTrace, endSpan, recordSkillActivation } from "../telemetry.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { bashTool } from "./bash.js";
import { listSkillsTool } from "./list-skills.js";
import { searchSkillsTool } from "./search-skills.js";
import { activateSkillTool } from "./activate-skill.js";

const SUBAGENT_DIR = path.resolve(".looploop/subagents");

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
let _parentSessionId: string | null = null;

export function setParentModel(provider: string, id: string) {
  _parentModel = { provider, id };
}

export function setParentSessionId(sessionId: string) {
  _parentSessionId = sessionId;
}

function generateSubagentId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `sub-${date}-${time}-${rand}`;
}

interface SubagentSession {
  id: string;
  parentSessionId: string | null;
  task: string;
  skills: string[];
  model: string;
  createdAt: string;
  completedAt: string;
  turns: number;
  result: string;
  messages: any[];
}

function saveSubagentSession(session: SubagentSession) {
  fs.mkdirSync(SUBAGENT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(SUBAGENT_DIR, `${session.id}.json`),
    JSON.stringify(session),
  );
}

export const spawnSubagentTool: AgentTool<typeof params> = {
  name: "spawn_subagent",
  label: "Spawn Subagent",
  description:
    "Create an isolated sub-agent to handle a focused task. The subagent runs with its own context and returns the result. It has access to bash, read, write, and skill tools. Optionally pre-load skills for it.",
  parameters: params,
  execute: async (_id, { task, skills }, signal) => {
    const span = startTrace("subagent", { task });
    const subagentId = generateSubagentId();
    const createdAt = new Date().toISOString();

    // Build system prompt from requested skills
    let systemPrompt =
      "You are a focused sub-agent. Complete the given task concisely and return the result.\n" +
      "You have access to bash, read, write, and skill tools. Use them as needed.\n" +
      "Do NOT spawn further sub-agents.\n\n";

    const loadedSkills: string[] = [];
    if (skills && skills.length > 0) {
      for (const name of skills) {
        const skill = loadSkill(name);
        if (skill) {
          systemPrompt += `--- Skill: ${skill.name} ---\n${skill.content}\n\n`;
          recordSkillActivation(`${skill.category}/${skill.name}`);
          loadedSkills.push(name);
        }
      }
    }

    // Use parent model if available, otherwise fallback
    const provider = _parentModel?.provider ?? "anthropic";
    const modelId = _parentModel?.id ?? "claude-sonnet-4-20250514";
    const model = getModel(provider as any, modelId as any);
    const modelSpec = `${provider}/${modelId}`;

    const subAgent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: subagentTools,
      },
      streamFn: streamSimple,
    });

    let result = "";
    let turns = 0;
    subAgent.subscribe((event: AgentEvent) => {
      if (
        event.type === "message_update" &&
        "assistantMessageEvent" in event &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        result += event.assistantMessageEvent.delta;
      }
      if (event.type === "turn_end") {
        turns++;
      }
    });

    try {
      await subAgent.prompt(task);
      endSpan(span);

      // Persist subagent session
      saveSubagentSession({
        id: subagentId,
        parentSessionId: _parentSessionId,
        task,
        skills: loadedSkills,
        model: modelSpec,
        createdAt,
        completedAt: new Date().toISOString(),
        turns,
        result: result || "(no output)",
        messages: subAgent.state.messages,
      });

      return {
        content: [{ type: "text", text: result || "(subagent produced no output)" }],
        details: { subagentId, task, skills: loadedSkills, model: modelSpec, turns },
      };
    } catch (err: any) {
      endSpan(span, err.message);

      // Persist even on failure for debugging
      saveSubagentSession({
        id: subagentId,
        parentSessionId: _parentSessionId,
        task,
        skills: loadedSkills,
        model: modelSpec,
        createdAt,
        completedAt: new Date().toISOString(),
        turns,
        result: `ERROR: ${err.message}`,
        messages: subAgent.state.messages,
      });

      throw err;
    }
  },
};

/** List all subagent sessions, optionally filtered by parent session */
export function listSubagentSessions(parentSessionId?: string): SubagentSession[] {
  if (!fs.existsSync(SUBAGENT_DIR)) return [];

  const files = fs.readdirSync(SUBAGENT_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();

  const sessions: SubagentSession[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SUBAGENT_DIR, file), "utf-8");
      const data: SubagentSession = JSON.parse(raw);
      if (!parentSessionId || data.parentSessionId === parentSessionId) {
        sessions.push(data);
      }
    } catch {}
  }
  return sessions;
}

/** Load a specific subagent session by ID */
export function loadSubagentSession(id: string): SubagentSession | null {
  const filePath = path.join(SUBAGENT_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
