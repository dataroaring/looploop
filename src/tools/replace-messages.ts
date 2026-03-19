import { Type } from "@mariozechner/pi-ai";
import type { AgentTool, AgentMessage } from "@mariozechner/pi-agent-core";
import { recordCompression } from "../telemetry.js";

const params = Type.Object({
  before_index: Type.Number({ description: "Replace all messages before this index (0-based) with the summary" }),
  summary: Type.String({ description: "Summary text to replace the old messages with" }),
});

/** Shared reference to the agent — set by index.ts at startup */
let _replaceMessagesFn: ((newMessages: AgentMessage[]) => void) | null = null;
let _getMessagesFn: (() => AgentMessage[]) | null = null;

export function bindMessageAccess(
  getMessages: () => AgentMessage[],
  replaceMessages: (msgs: AgentMessage[]) => void,
) {
  _getMessagesFn = getMessages;
  _replaceMessagesFn = replaceMessages;
}

/**
 * Pending compression — stored by the tool, applied by afterToolCall hook
 * to splice the running loop's context.messages in-place.
 */
let _pendingCompression: { beforeIndex: number; summaryMessage: AgentMessage } | null = null;

export function consumePendingCompression(): { beforeIndex: number; summaryMessage: AgentMessage } | null {
  const pending = _pendingCompression;
  _pendingCompression = null;
  return pending;
}

export const replaceMessagesTool: AgentTool<typeof params> = {
  name: "replace_messages",
  label: "Replace Messages",
  description: "Compress context by replacing older messages with a summary. All messages before the given index are replaced with a single user message containing the summary.",
  parameters: params,
  execute: async (_id, { before_index, summary }) => {
    if (!_getMessagesFn || !_replaceMessagesFn) {
      throw new Error("Message access not bound. Internal error.");
    }

    const messages = _getMessagesFn();
    if (before_index <= 0 || before_index > messages.length) {
      throw new Error(`Invalid before_index: ${before_index}. Must be 1..${messages.length}.`);
    }

    const removed = before_index;
    const kept = messages.slice(before_index);
    const summaryMessage: AgentMessage = {
      role: "user",
      content: `[Context summary of ${removed} previous messages]\n\n${summary}`,
      timestamp: Date.now(),
    };

    // Update agent state (for after the loop ends)
    _replaceMessagesFn([summaryMessage, ...kept]);

    // Store pending compression so afterToolCall hook can splice the loop's context
    _pendingCompression = { beforeIndex: before_index, summaryMessage };

    recordCompression();

    return {
      content: [{ type: "text", text: `Compressed: ${removed} messages replaced with summary. ${kept.length} messages retained.` }],
      details: { removed, retained: kept.length },
    };
  },
};
