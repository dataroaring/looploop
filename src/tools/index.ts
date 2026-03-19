import type { AgentTool } from "@mariozechner/pi-agent-core";
import { listSkillsTool } from "./list-skills.js";
import { searchSkillsTool } from "./search-skills.js";
import { activateSkillTool } from "./activate-skill.js";
import { getContextInfoTool } from "./get-context-info.js";
import { replaceMessagesTool } from "./replace-messages.js";
import { spawnSubagentTool } from "./spawn-subagent.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { bashTool } from "./bash.js";

export const allTools: AgentTool<any>[] = [
  listSkillsTool,
  searchSkillsTool,
  activateSkillTool,
  getContextInfoTool,
  replaceMessagesTool,
  spawnSubagentTool,
  readTool,
  writeTool,
  bashTool,
];

export {
  listSkillsTool,
  searchSkillsTool,
  activateSkillTool,
  getContextInfoTool,
  replaceMessagesTool,
  spawnSubagentTool,
  readTool,
  writeTool,
  bashTool,
};
