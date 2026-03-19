import fs from "node:fs";
import path from "node:path";
import { Type, getModel, streamSimple, type AssistantMessage } from "@mariozechner/pi-ai";
import { Agent, type AgentTool, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { loadSkill } from "../skill-loader.js";
import { startTrace, endSpan, recordSkillActivation } from "../telemetry.js";
import { dim, cyan, green, red, magenta } from "../display.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { bashTool } from "./bash.js";
import { listSkillsTool } from "./list-skills.js";
import { searchSkillsTool } from "./search-skills.js";
import { activateSkillTool } from "./activate-skill.js";

const SUBAGENT_DIR = path.resolve(".looploop/subagents");

const params = Type.Object({
  tasks: Type.Array(
    Type.Object({
      task: Type.String({ description: "Task description" }),
      skills: Type.Optional(Type.Array(Type.String(), { description: "Skill names to pre-load" })),
    }),
    { description: "One or more tasks to run in parallel as subagents" },
  ),
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

/** Parent agent state — set by index.ts at startup */
let _parentModel: { provider: string; id: string } | null = null;
let _parentSessionId: string | null = null;
let _getParentContext: (() => { systemPrompt: string; messages: AgentMessage[] }) | null = null;

export function setParentModel(provider: string, id: string) {
  _parentModel = { provider, id };
}

export function setParentSessionId(sessionId: string) {
  _parentSessionId = sessionId;
}

export function bindParentContext(fn: () => { systemPrompt: string; messages: AgentMessage[] }) {
  _getParentContext = fn;
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
  outputPath: string;
  messages: any[];
}

function saveSubagentSession(session: SubagentSession) {
  fs.mkdirSync(SUBAGENT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(SUBAGENT_DIR, `${session.id}.json`),
    JSON.stringify(session),
  );
}

/**
 * Build a context summary from the parent agent's messages.
 * This gives the subagent awareness of the full conversation without
 * polluting the main agent's context with subagent internals.
 */
function buildParentContextSummary(): string {
  if (!_getParentContext) return "";

  const { systemPrompt, messages } = _getParentContext();
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push("=== Parent System Prompt ===\n" + systemPrompt);
  }

  // Include conversation history as context (compact form)
  const contextMsgs: string[] = [];
  for (const msg of messages) {
    const m = msg as any;
    if (m.role === "user") {
      const text = typeof m.content === "string"
        ? m.content
        : m.content?.map((c: any) => c.type === "text" ? c.text : "").join("") ?? "";
      if (text) contextMsgs.push(`USER: ${text}`);
    } else if (m.role === "assistant") {
      const textParts: string[] = [];
      for (const block of m.content || []) {
        if (block.type === "text" && block.text) textParts.push(block.text);
      }
      if (textParts.length > 0) contextMsgs.push(`ASSISTANT: ${textParts.join("")}`);
    }
    // Skip toolResult — subagent doesn't need parent's tool internals
  }

  if (contextMsgs.length > 0) {
    parts.push("=== Parent Conversation Context ===\n" + contextMsgs.join("\n\n"));
  }

  return parts.join("\n\n");
}

/** Run a single subagent and write output to a known file */
async function runOneSubagent(
  task: string,
  skills: string[] | undefined,
  label: string,
  signal?: AbortSignal,
): Promise<{ id: string; task: string; skills: string[]; outputPath: string; turns: number; error?: string }> {
  const span = startTrace("subagent", { task });
  const subagentId = generateSubagentId();
  const createdAt = new Date().toISOString();

  // Output file — the agreed-upon location for subagent final output
  const outputDir = path.join(SUBAGENT_DIR, subagentId);
  const outputPath = path.join(outputDir, "output.md");
  fs.mkdirSync(outputDir, { recursive: true });

  // Build system prompt: parent context + skills + output instructions
  const parentContext = buildParentContextSummary();

  let systemPrompt =
    "You are a focused sub-agent. Complete the given task concisely.\n" +
    "You have access to bash, read, write, and skill tools. Use them as needed.\n" +
    "Do NOT spawn further sub-agents.\n\n" +
    `IMPORTANT: When you are done, write your FINAL OUTPUT to: ${outputPath}\n` +
    "This file is the ONLY thing the main agent reads. Include all results, analysis, and conclusions there.\n" +
    "Use markdown format. Be thorough but concise.\n\n";

  if (parentContext) {
    systemPrompt += parentContext + "\n\n";
  }

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

  const provider = _parentModel?.provider ?? "anthropic";
  const modelId = _parentModel?.id ?? "claude-sonnet-4-20250514";
  const model = getModel(provider as any, modelId as any);
  const modelSpec = `${provider}/${modelId}`;

  const subAgent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: subagentTools,
      thinkingLevel: "low" as any,
    },
    streamFn: streamSimple,
  });

  let turns = 0;
  subAgent.subscribe((event: AgentEvent) => {
    if (
      event.type === "message_update" &&
      "assistantMessageEvent" in event
    ) {
      const mevt = event.assistantMessageEvent;
      if (mevt.type === "thinking_start") {
        console.log(dim(`    ${label} ${magenta("◆")} thinking...`));
      }
    }
    if (event.type === "turn_start") {
      console.log(dim(`    ${label} turn ${turns + 1}...`));
    }
    if (event.type === "turn_end") {
      turns++;
    }
    if (event.type === "tool_execution_start") {
      console.log(dim(`    ${label} ▶ ${event.toolName}`));
    }
  });

  try {
    await subAgent.prompt(task);
    endSpan(span);

    saveSubagentSession({
      id: subagentId,
      parentSessionId: _parentSessionId,
      task,
      skills: loadedSkills,
      model: modelSpec,
      createdAt,
      completedAt: new Date().toISOString(),
      turns,
      outputPath,
      messages: subAgent.state.messages,
    });

    console.log(`    ${label} ${green("✓")} done (${turns} turns)`);
    return { id: subagentId, task, skills: loadedSkills, outputPath, turns };

  } catch (err: any) {
    endSpan(span, err.message);

    // Write error to output file so main agent can read it
    fs.writeFileSync(outputPath, `# Error\n\n${err.message}\n`);

    saveSubagentSession({
      id: subagentId,
      parentSessionId: _parentSessionId,
      task,
      skills: loadedSkills,
      model: modelSpec,
      createdAt,
      completedAt: new Date().toISOString(),
      turns,
      outputPath,
      messages: subAgent.state.messages,
    });

    console.log(`    ${label} ${red("✗")} error: ${err.message}`);
    return { id: subagentId, task, skills: loadedSkills, outputPath, turns, error: err.message };
  }
}

export const spawnSubagentTool: AgentTool<typeof params> = {
  name: "spawn_subagent",
  label: "Spawn Subagent",
  description:
    "Run one or more isolated sub-agents in parallel. Each subagent gets the main agent's full conversation context, " +
    "handles a focused task independently, and writes its final output to a file. " +
    "Only the final output file content is returned to the main agent — subagent intermediate steps stay isolated. " +
    "Subagents have access to bash, read, write, and skill tools.",
  parameters: params,
  execute: async (_id, { tasks }, signal) => {
    const count = tasks.length;
    console.log(dim(`  ⊕ spawning ${count} subagent${count > 1 ? "s" : ""} in parallel...`));

    const promises = tasks.map((t, i) => {
      const label = count > 1 ? cyan(`[${i + 1}/${count}]`) : cyan("[sub]");
      return runOneSubagent(t.task, t.skills, label, signal);
    });

    const results = await Promise.all(promises);

    // Read each subagent's output file — this is the ONLY content that enters main agent context
    const outputs = results.map((r, i) => {
      let output = "(no output)";
      try {
        if (fs.existsSync(r.outputPath)) {
          output = fs.readFileSync(r.outputPath, "utf-8");
        }
      } catch {}

      const header = count > 1 ? `── Subagent ${i + 1}: ${r.task.slice(0, 60)} ──` : "";
      return header ? `${header}\n${output}` : output;
    });

    const combined = outputs.join("\n\n");

    const details = results.map(r => ({
      subagentId: r.id,
      task: r.task,
      skills: r.skills,
      outputPath: r.outputPath,
      turns: r.turns,
      error: r.error,
    }));

    return {
      content: [{ type: "text", text: combined }],
      details: { count, subagents: details },
    };
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
