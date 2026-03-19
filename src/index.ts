import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, getProviders, getModels, streamSimple, type AssistantMessage, type ToolResultMessage } from "@mariozechner/pi-ai";
import { allTools } from "./tools/index.js";
import { bindMessageAccess } from "./tools/replace-messages.js";
import { setParentModel, setParentSessionId, listSubagentSessions, loadSubagentSession } from "./tools/spawn-subagent.js";
import { loadCoreSkills } from "./skill-loader.js";
import {
  initTelemetry,
  shutdownTelemetry,
  startTrace,
  startSpan,
  endSpan,
  recordLlmCall,
  recordToolCall,
  recordMessage,
  rebuildMetrics,
  getContextStats,
} from "./telemetry.js";
import { RunDisplay, dim, red } from "./display.js";
import { SessionStore } from "./session.js";

// ── Build system prompt from core skills ──

let coreSkillPaths: string[] = [];

function buildSystemPrompt(): string {
  const coreSkills = loadCoreSkills();
  coreSkillPaths = coreSkills.map(s => s.path);
  let prompt = "";
  for (const skill of coreSkills) {
    if (skill.content) {
      prompt += `${skill.content}\n\n`;
    }
  }
  return prompt.trim();
}

// ── /context command ──

function printContextStats(systemPrompt: string, messages: import("@mariozechner/pi-agent-core").AgentMessage[]) {
  const stats = getContextStats();
  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  const toolSummary = Object.entries(stats.toolCalls)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");

  // Collect skill content injected via activate_skill tool results
  const activatedSkillContents: string[] = [];
  for (const msg of messages) {
    const m = msg as any;
    if (m.role === "toolResult" && m.toolName === "activate_skill" && !m.isError) {
      const text = m.content?.map((c: any) => c.type === "text" ? c.text : "").join("") ?? "";
      if (text) activatedSkillContents.push(text);
    }
  }

  const corePathList = coreSkillPaths.length > 0
    ? coreSkillPaths.map(p => `    ${p}`).join("\n")
    : "    (none)";

  console.log(`
── Stats ──
  LLM calls: ${stats.llmCalls}
  Total tokens: ${totalTokens.toLocaleString()} (in: ${stats.totalInputTokens.toLocaleString()}, out: ${stats.totalOutputTokens.toLocaleString()})
  Total cost: $${stats.totalCost.toFixed(4)}
  Messages: ${stats.messageCount}
  Active skills: ${stats.activeSkills.length > 0 ? stats.activeSkills.join(", ") : "none"}
  Compression events: ${stats.compressionEvents}
  Tool calls: ${toolSummary || "none"}
  Avg latency: ${stats.avgLatencyMs}ms per LLM call

── System Prompt (core skills) ──
${corePathList}
`);

  if (activatedSkillContents.length > 0) {
    console.log(`── Activated Skills (${activatedSkillContents.length}) ──`);
    for (const content of activatedSkillContents) {
      console.log(content);
      console.log();
    }
  }
}

// ── /context detail command ──

function buildContextDetail(systemPrompt: string, messages: import("@mariozechner/pi-agent-core").AgentMessage[]): string {
  const out: string[] = [];

  // System prompt as skill paths
  const corePathList = coreSkillPaths.length > 0
    ? coreSkillPaths.map(p => `  ${p}`).join("\n")
    : "  (none)";
  out.push(`── System Prompt (core skills) ──`, corePathList, "");

  // Activated skills
  const activatedSkills: string[] = [];
  for (const msg of messages) {
    const m = msg as any;
    if (m.role === "toolResult" && m.toolName === "activate_skill" && !m.isError) {
      const text = m.content?.map((c: any) => c.type === "text" ? c.text : "").join("") ?? "";
      if (text) {
        const idx = messages.indexOf(msg);
        let skillName = "unknown";
        for (let j = idx - 1; j >= 0; j--) {
          const prev = messages[j] as any;
          if (prev.role === "assistant") {
            for (const block of prev.content || []) {
              if (block.type === "toolCall" && block.name === "activate_skill" && block.arguments?.name) {
                skillName = block.arguments.name;
              }
            }
            break;
          }
        }
        activatedSkills.push(skillName);
      }
    }
  }

  if (activatedSkills.length > 0) {
    out.push(`── Activated Skills (${activatedSkills.length}) ──`);
    for (const name of activatedSkills) out.push(`  ${name}`);
    out.push("");
  }

  // Messages
  if (messages.length === 0) {
    out.push("(no messages in context)");
    return out.join("\n");
  }

  out.push(`── Messages (${messages.length}) ──`, "");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as any;
    const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "?";
    const idx = `[${i}]`;

    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content?.map((c: any) => c.type === "text" ? c.text : `[${c.type}]`).join("") ?? "";
      out.push(`${idx} ${ts}  USER`);
      for (const line of text.split("\n")) out.push(`   ${line}`);
      out.push("");

    } else if (msg.role === "assistant") {
      const am = msg as AssistantMessage;
      const textParts: string[] = [];
      const toolCalls: string[] = [];

      for (const block of am.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "toolCall") {
          toolCalls.push(`[${block.id}] ${block.name}(${JSON.stringify(block.arguments)})`);
        }
      }

      const fullText = textParts.join("");
      const tokens = `in:${am.usage.input + am.usage.cacheRead} out:${am.usage.output} $${am.usage.cost.total.toFixed(4)}`;
      out.push(`${idx} ${ts}  ASSISTANT  [${am.model}] [${tokens}] stop:${am.stopReason}`);
      if (fullText) {
        for (const line of fullText.split("\n")) out.push(`   ${line}`);
      }
      for (const tc of toolCalls) out.push(`   -> ${tc}`);
      out.push("");

    } else if (msg.role === "toolResult") {
      const tr = msg as ToolResultMessage;
      const text = tr.content?.map((c: any) => c.type === "text" ? c.text : `[${c.type}]`).join("") ?? "";
      const err = tr.isError ? " ERROR" : "";
      out.push(`${idx} ${ts}  TOOL_RESULT  ${tr.toolName}  [callId:${tr.toolCallId}]${err}`);
      if (text) {
        for (const line of text.split("\n")) out.push(`   ${line}`);
      }
      if ((tr as any).details && Object.keys((tr as any).details).length > 0) {
        out.push(`   details: ${JSON.stringify((tr as any).details)}`);
      }
      out.push("");

    } else {
      out.push(`${idx} ${ts}  ${msg.role ?? "unknown"}`, "");
    }
  }

  out.push(`── End (${messages.length} messages) ──`);
  return out.join("\n");
}

// ── Main ──

function parseModelSpec(spec: string): { provider: string; modelId: string } {
  const parts = spec.split("/");
  if (parts.length === 2) {
    return { provider: parts[0], modelId: parts[1] };
  }
  return { provider: "anthropic", modelId: spec };
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

async function main() {
  initTelemetry();

  const systemPrompt = buildSystemPrompt();
  const modelSpec = process.env.LOOPLOOP_MODEL || DEFAULT_MODEL;
  const { provider, modelId } = parseModelSpec(modelSpec);
  const model = getModel(provider as any, modelId as any);

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: allTools,
    },
    streamFn: streamSimple,
  });

  setParentModel(provider, modelId);

  bindMessageAccess(
    () => agent.state.messages,
    (msgs) => agent.replaceMessages(msgs),
  );

  // ── Display + Telemetry ──

  const display = new RunDisplay();
  const session = new SessionStore();
  setParentSessionId(session.sessionId);
  console.log(dim(`  session: ${session.sessionId}`));

  let currentTrace: ReturnType<typeof startTrace> | null = null;
  let currentTurnSpan: ReturnType<typeof startSpan> | null = null;
  let turnStartTime = 0;

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {

      // ── Agent lifecycle ──

      case "agent_start":
        currentTrace = startTrace("agent_run");
        display.clear();
        break;

      case "agent_end":
        if (currentTrace) endSpan(currentTrace);
        currentTrace = null;
        display.printHint();
        session.save(agent.state.messages, `${agent.state.model.provider}/${agent.state.model.id}`);
        break;

      // ── Turn lifecycle ──

      case "turn_start":
        turnStartTime = Date.now();
        if (currentTrace) {
          currentTurnSpan = startSpan("llm_turn", currentTrace);
        }
        display.turnStart();
        break;

      case "turn_end": {
        const msg = event.message;
        if (msg && "role" in msg && msg.role === "assistant") {
          const am = msg as AssistantMessage;
          const latencyMs = Date.now() - turnStartTime;
          const tokensIn = am.usage.input + am.usage.cacheRead;

          // Telemetry
          recordLlmCall(tokensIn, am.usage.output, am.usage.cost.total, latencyMs);
          if (currentTurnSpan) {
            currentTurnSpan.setAttributes({
              "llm.model": am.model,
              "llm.tokens_in": tokensIn,
              "llm.tokens_out": am.usage.output,
              "llm.latency_ms": latencyMs,
              "llm.cost": am.usage.cost.total,
              "llm.stop_reason": am.stopReason,
            });
          }

          // Display compact turn summary
          display.turnEnd(am.model, tokensIn, am.usage.output, latencyMs, am.usage.cost.total, am.stopReason);
        }
        if (currentTurnSpan) endSpan(currentTurnSpan);
        currentTurnSpan = null;
        break;
      }

      // ── Message streaming ──

      case "message_start":
        recordMessage();
        break;

      case "message_update": {
        const evt = event.assistantMessageEvent;
        switch (evt.type) {
          case "thinking_start":
            display.thinkingStart();
            break;
          case "thinking_end":
            if ("content" in evt) {
              display.thinkingEnd(evt.content as string);
            }
            break;
          case "text_delta":
            display.textDelta(evt.delta);
            break;
          case "text_end":
            display.textEnd();
            break;
          case "toolcall_end":
            if ("toolCall" in evt) {
              display.toolAnnounce(evt.toolCall.name, evt.toolCall.arguments);
            }
            break;
        }
        break;
      }

      // ── Tool execution ──

      case "tool_execution_start":
        recordToolCall(event.toolName);
        display.toolStart(event.toolCallId, event.toolName, event.args);
        if (currentTrace) {
          const toolSpan = startSpan(`tool:${event.toolName}`, currentTrace, {
            "tool.name": event.toolName,
            "tool.args": JSON.stringify(event.args).slice(0, 500),
          });
          endSpan(toolSpan);
        }
        break;

      case "tool_execution_end":
        display.toolEnd(event.toolCallId, event.toolName, event.result, event.isError);
        break;
    }
  });

  // ── Command history ──

  const HISTORY_FILE = path.resolve(".looploop/history");
  const HISTORY_SIZE = 500;

  function loadHistory(): string[] {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        return fs.readFileSync(HISTORY_FILE, "utf-8").split("\n").filter(Boolean);
      }
    } catch {}
    return [];
  }

  function saveHistory(history: string[]) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, history.slice(-HISTORY_SIZE).join("\n") + "\n");
  }

  // ── REPL ──

  const savedHistory = loadHistory();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: HISTORY_SIZE,
    history: savedHistory,
  } as any);

  // Fallback: manually populate history for older Node versions
  const rlAny = rl as any;
  if (rlAny.history && rlAny.history.length === 0 && savedHistory.length > 0) {
    rlAny.history.push(...savedHistory.reverse());
  }

  console.log(dim(`  model: ${provider}/${modelId}`));
  console.log("looploop agent ready. Commands: /context, /browse, /sessions, /subagents, /resume <id>, /load <id>, /model, /exit");
  console.log(dim("  Press Esc to abort a running prompt\n"));

  const prompt = () => {
    rl.question("> ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();

      // Save to history (rl.history is newest-first internally)
      const rlHistory: string[] = (rl as any).history ?? [];
      saveHistory([...rlHistory].reverse().filter(Boolean));


      if (trimmed === "/subagents" || trimmed.startsWith("/subagents ")) {
        const arg = trimmed.slice(10).trim();
        if (!arg || arg === "list") {
          const subs = listSubagentSessions();
          if (subs.length === 0) {
            console.log(dim("(no subagent sessions)"));
          } else {
            console.log(`\n  ${subs.length} subagent session(s):\n`);
            for (const s of subs) {
              const date = new Date(s.createdAt).toLocaleString();
              const parent = s.parentSessionId ? dim(` parent:${s.parentSessionId}`) : "";
              console.log(`  ${s.id}  ${s.turns} turns  ${date}${parent}`);
              console.log(dim(`    ${s.task.slice(0, 100)}`));
            }
            console.log(dim(`\n  /subagents <id> to view details\n`));
          }
        } else {
          const sub = loadSubagentSession(arg);
          if (!sub) {
            console.log(red(`Subagent "${arg}" not found.`));
          } else {
            const detail = [
              `── Subagent: ${sub.id} ──`,
              `  parent:    ${sub.parentSessionId ?? "(none)"}`,
              `  task:      ${sub.task}`,
              `  skills:    ${sub.skills.length > 0 ? sub.skills.join(", ") : "none"}`,
              `  model:     ${sub.model}`,
              `  turns:     ${sub.turns}`,
              `  created:   ${sub.createdAt}`,
              `  completed: ${sub.completedAt}`,
              ``,
              `── Result ──`,
              sub.result,
            ].join("\n");
            rl.pause();
            await display.pager(detail);
            rl.resume();
          }
        }
        return prompt();
      }

      if (trimmed === "/sessions") {
        const sessions = SessionStore.list();
        if (sessions.length === 0) {
          console.log(dim("(no saved sessions)"));
        } else {
          console.log(`\n  ${sessions.length} saved session(s):\n`);
          for (const s of sessions) {
            const current = s.id === session.sessionId ? " ← current" : "";
            const date = new Date(s.updatedAt).toLocaleString();
            const modelInfo = s.model ? dim(` [${s.model}]`) : "";
            console.log(`  ${s.id}  ${s.messageCount} msgs  ${date}${modelInfo}${current}`);
            if (s.preview) console.log(dim(`    ${s.preview}`));
          }
          console.log(dim(`\n  /resume <id> to continue a session`));
          console.log(dim(`  /load <id> to load messages only\n`));
        }
        return prompt();
      }

      if (trimmed.startsWith("/resume ")) {
        const targetId = trimmed.slice(8).trim();
        const data = SessionStore.loadFull(targetId);
        if (!data) {
          console.log(red(`Session "${targetId}" not found.`));
        } else {
          // Restore messages
          agent.replaceMessages(data.messages);
          session.resumeSession(targetId);
          setParentSessionId(session.sessionId);
          rebuildMetrics(data.messages);

          // Restore model if saved
          if (data.model) {
            try {
              const { provider: p, modelId: m } = parseModelSpec(data.model);
              const newModel = getModel(p as any, m as any);
              agent.state.model = newModel as any;
            } catch {}
          }

          console.log(`Resumed session ${targetId} (${data.messages.length} messages, model: ${agent.state.model.provider}/${agent.state.model.id})`);

          // If last message is assistant with tool_use, continue the loop
          const lastMsg = data.messages[data.messages.length - 1] as any;
          if (lastMsg?.role === "assistant" && lastMsg.stopReason === "tool_use") {
            console.log(dim("  Continuing pending tool calls..."));
            try {
              await agent.continue();
              console.log();
            } catch (err: any) {
              console.error(`\n${red(`Error: ${err.message}`)}\n`);
            }
          }
        }
        return prompt();
      }

      if (trimmed.startsWith("/load ")) {
        const targetId = trimmed.slice(6).trim();
        const messages = SessionStore.load(targetId);
        if (!messages) {
          console.log(red(`Session "${targetId}" not found.`));
        } else {
          agent.replaceMessages(messages);
          session.resumeSession(targetId);
          setParentSessionId(session.sessionId);
          rebuildMetrics(messages);
          console.log(`Loaded session ${targetId} (${messages.length} messages)`);
        }
        return prompt();
      }

      if (trimmed === "/browse") {
        if (!display.hasEntries()) {
          console.log(dim("(no entries to browse — run a prompt first)"));
        } else {
          rl.pause();
          await display.browse();
          rl.resume();
        }
        return prompt();
      }

      if (trimmed.startsWith("/model")) {
        const arg = trimmed.slice(6).trim();
        if (!arg) {
          const currentModel = agent.state.model;
          console.log(`\n  Current model: ${currentModel.provider}/${currentModel.id}`);
          console.log(dim("  /model list — show available models"));
          console.log(dim("  /model <provider/model-id> — switch model\n"));
        } else if (arg === "list") {
          const providers = getProviders();
          for (const prov of providers) {
            const models = getModels(prov);
            console.log(`\n  ${prov}:`);
            for (const m of models) {
              const current = m.id === agent.state.model.id && m.provider === agent.state.model.provider ? " ← current" : "";
              console.log(dim(`    ${m.id}${current}`));
            }
          }
          console.log();
        } else {
          const { provider: p, modelId: m } = parseModelSpec(arg);
          try {
            const newModel = getModel(p as any, m as any);
            agent.state.model = newModel as any;
            console.log(`  Switched to ${p}/${m}`);
            setParentModel(p, m);
          } catch (err: any) {
            console.log(red(`  Failed: ${err.message}`));
          }
        }
        return prompt();
      }

      if (trimmed === "/context detail") {
        const text = buildContextDetail(agent.state.systemPrompt, agent.state.messages);
        rl.pause();
        await display.pager(text);
        rl.resume();
        return prompt();
      }

      if (trimmed === "/context") {
        printContextStats(agent.state.systemPrompt, agent.state.messages);
        return prompt();
      }

      if (trimmed === "/exit" || trimmed === "/quit") {
        rl.close();
        return;
      }

      // Listen for Escape/Ctrl+C to abort during agent execution
      let aborted = false;
      const onKeypress = (data: Buffer) => {
        const key = data.toString();
        if (key === "\x1b" || key === "\x1b\x1b" || key === "\x03") {
          aborted = true;
          agent.abort();
        }
      };

      // Pause readline, take over stdin in raw mode for keypress detection
      rl.pause();
      const wasRaw = process.stdin.isTTY ? (process.stdin as any).isRaw : false;
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", onKeypress);
      }

      try {
        await agent.prompt(trimmed);
        console.log();
      } catch (err: any) {
        if (aborted) {
          console.log(`\n${dim("(aborted)")}\n`);
        } else {
          console.error(`\n${red(`Error: ${err.message}`)}\n`);
        }
      } finally {
        if (process.stdin.isTTY) {
          process.stdin.removeListener("data", onKeypress);
          // Restore raw mode to what it was before we took over
          process.stdin.setRawMode(wasRaw);
        }
        // Resume readline — it will re-enable its own raw mode for terminal input
        rl.resume();
      }

      prompt();
    });
  };

  // Ctrl+C during input clears the line and re-prompts
  rl.on("close", () => {
    // Only fires on EOF (Ctrl+D) — clean exit
    console.log("\nShutting down...");
    shutdownTelemetry();
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    // Ctrl+C during readline input — clear line and re-prompt
    console.log();
    prompt();
  });

  prompt();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
