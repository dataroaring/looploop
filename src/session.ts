import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

const SESSIONS_DIR = path.resolve(".looploop/sessions");

export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  model?: string; // "provider/modelId"
}

interface SessionFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  model?: string; // "provider/modelId"
  messages: AgentMessage[];
}

// ── Session ID ──

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // 2026-03-18
  const time = now.toTimeString().slice(0, 5).replace(":", ""); // 0412
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

// ── Extract preview from messages ──

function extractPreview(messages: AgentMessage[]): string {
  for (const msg of messages) {
    if ("role" in msg && (msg as any).role === "user") {
      const content = (msg as any).content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
          : "";
      return text.slice(0, 80).replace(/\n/g, " ");
    }
  }
  return "";
}

// ── Auto-save ──

export class SessionStore {
  private id: string;
  private createdAt: string;

  constructor() {
    this.id = generateId();
    this.createdAt = new Date().toISOString();
  }

  get sessionId(): string {
    return this.id;
  }

  save(messages: AgentMessage[], model?: string) {
    if (messages.length === 0) return;

    fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    const data: SessionFile = {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      model,
      messages,
    };

    fs.writeFileSync(
      path.join(SESSIONS_DIR, `${this.id}.json`),
      JSON.stringify(data),
    );
  }

  // ── List sessions ──

  static list(): SessionMeta[] {
    if (!fs.existsSync(SESSIONS_DIR)) return [];

    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse(); // newest first

    const sessions: SessionMeta[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
        const data: SessionFile = JSON.parse(raw);
        sessions.push({
          id: data.id,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          messageCount: data.messages.length,
          preview: extractPreview(data.messages),
          model: data.model,
        });
      } catch {
        // skip corrupt files
      }
    }
    return sessions;
  }

  // ── Load a session (messages only) ──

  static load(id: string): AgentMessage[] | null {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data: SessionFile = JSON.parse(raw);
      return data.messages;
    } catch {
      return null;
    }
  }

  // ── Load full session (messages + model) ──

  static loadFull(id: string): { messages: AgentMessage[]; model?: string } | null {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data: SessionFile = JSON.parse(raw);
      return { messages: data.messages, model: data.model };
    } catch {
      return null;
    }
  }

  /** Switch to an existing session (for /load) */
  resumeSession(id: string) {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return false;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data: SessionFile = JSON.parse(raw);
      this.id = data.id;
      this.createdAt = data.createdAt;
      return true;
    } catch {
      return false;
    }
  }
}
