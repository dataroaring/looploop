export interface SkillMeta {
  name: string;
  category: string;
  description: string;
  /** Full file path */
  path: string;
  /** Prompt body (loaded on activate) */
  content?: string;
}

export interface SkillGroup {
  category: string;
  description: string;
  skills: Pick<SkillMeta, "name" | "description">[];
}

export interface ContextStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  messageCount: number;
  toolCalls: Record<string, number>;
  activeSkills: string[];
  compressionEvents: number;
  avgLatencyMs: number;
  llmCalls: number;
}
