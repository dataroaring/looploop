import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { listSkillGroups, listSkillsInCategory } from "../skill-loader.js";

const params = Type.Object({
  category: Type.Optional(Type.String({ description: "Category name to list skills within. Omit to see all categories." })),
});

export const listSkillsTool: AgentTool<typeof params> = {
  name: "list_skills",
  label: "List Skills",
  description: "Browse available skill categories and skills. Without category: returns all groups. With category: returns skills in that group.",
  parameters: params,
  execute: async (_id, { category }) => {
    if (category) {
      const skills = listSkillsInCategory(category);
      if (skills.length === 0) {
        return { content: [{ type: "text", text: `No skills found in category "${category}".` }], details: {} };
      }
      const text = skills.map(s => `- **${s.name}**: ${s.description}`).join("\n");
      return { content: [{ type: "text", text: `Skills in "${category}":\n${text}` }], details: { skills } };
    }

    const groups = listSkillGroups();
    if (groups.length === 0) {
      return { content: [{ type: "text", text: "No skill categories found." }], details: {} };
    }
    const text = groups.map(g =>
      `- **${g.category}** (${g.skills.length} skills): ${g.description}`
    ).join("\n");
    return { content: [{ type: "text", text: `Skill categories:\n${text}` }], details: { groups } };
  },
};
