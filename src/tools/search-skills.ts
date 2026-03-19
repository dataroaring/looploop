import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { searchSkills } from "../skill-loader.js";

const params = Type.Object({
  query: Type.String({ description: "Search keyword to find matching skills" }),
});

export const searchSkillsTool: AgentTool<typeof params> = {
  name: "search_skills",
  label: "Search Skills",
  description: "Search for skills by keyword across all categories. Matches against name, description, and category.",
  parameters: params,
  execute: async (_id, { query }) => {
    const results = searchSkills(query);
    if (results.length === 0) {
      return { content: [{ type: "text", text: `No skills match "${query}".` }], details: {} };
    }
    const text = results.map(s => `- **${s.category}/${s.name}**: ${s.description}`).join("\n");
    return { content: [{ type: "text", text: `Found ${results.length} skill(s):\n${text}` }], details: { results } };
  },
};
