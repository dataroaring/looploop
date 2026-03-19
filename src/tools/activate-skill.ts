import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { loadSkill } from "../skill-loader.js";
import { recordSkillActivation } from "../telemetry.js";

const params = Type.Object({
  name: Type.String({ description: "Skill name to activate and load full content" }),
});

export const activateSkillTool: AgentTool<typeof params> = {
  name: "activate_skill",
  label: "Activate Skill",
  description: "Load a skill's full prompt content by name. Use after discovering skills via list_skills or search_skills.",
  parameters: params,
  execute: async (_id, { name }) => {
    const skill = loadSkill(name);
    if (!skill) {
      throw new Error(`Skill "${name}" not found.`);
    }
    recordSkillActivation(`${skill.category}/${skill.name}`);
    return {
      content: [{ type: "text", text: `[Skill activated: ${skill.category}/${skill.name}]\n\n${skill.content}` }],
      details: { skill: { name: skill.name, category: skill.category } },
    };
  },
};
