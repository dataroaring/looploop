import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { SkillMeta, SkillGroup } from "./types.js";

const SKILLS_DIR = path.resolve("skills");

/** Parse a single skill .md file, returning metadata + optional content */
function parseSkillFile(filePath: string, includeContent: boolean): SkillMeta | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    if (!data.name || !data.category || !data.description) return null;
    return {
      name: data.name,
      category: data.category,
      description: data.description,
      path: filePath,
      content: includeContent ? content.trim() : undefined,
    };
  } catch {
    return null;
  }
}

/** Parse _index.md for a category description */
function parseCategoryIndex(categoryDir: string): string {
  const indexPath = path.join(categoryDir, "_index.md");
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const { data, content } = matter(raw);
    return data.description || content.trim().split("\n")[0] || "";
  } catch {
    return "";
  }
}

/** Get all skill groups (top-level categories) */
export function listSkillGroups(): SkillGroup[] {
  const groups: SkillGroup[] = [];
  if (!fs.existsSync(SKILLS_DIR)) return groups;

  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const categoryDir = path.join(SKILLS_DIR, entry.name);
    const description = parseCategoryIndex(categoryDir);
    const skills: SkillGroup["skills"] = [];

    for (const file of fs.readdirSync(categoryDir)) {
      if (file.startsWith("_") || !file.endsWith(".md")) continue;
      const meta = parseSkillFile(path.join(categoryDir, file), false);
      if (meta) skills.push({ name: meta.name, description: meta.description });
    }

    groups.push({ category: entry.name, description, skills });
  }
  return groups;
}

/** Get skills within a specific category */
export function listSkillsInCategory(category: string): SkillMeta[] {
  const categoryDir = path.join(SKILLS_DIR, category);
  if (!fs.existsSync(categoryDir)) return [];

  const skills: SkillMeta[] = [];
  for (const file of fs.readdirSync(categoryDir)) {
    if (file.startsWith("_") || !file.endsWith(".md")) continue;
    const meta = parseSkillFile(path.join(categoryDir, file), false);
    if (meta) skills.push(meta);
  }
  return skills;
}

/** Search skills by keyword across all categories */
export function searchSkills(query: string): SkillMeta[] {
  const q = query.toLowerCase();
  const results: SkillMeta[] = [];

  if (!fs.existsSync(SKILLS_DIR)) return results;

  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const categoryDir = path.join(SKILLS_DIR, entry.name);
    for (const file of fs.readdirSync(categoryDir)) {
      if (file.startsWith("_") || !file.endsWith(".md")) continue;
      const meta = parseSkillFile(path.join(categoryDir, file), false);
      if (!meta) continue;
      if (
        meta.name.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q) ||
        meta.category.toLowerCase().includes(q)
      ) {
        results.push(meta);
      }
    }
  }
  return results;
}

/** Load full skill content by name (searches all categories) */
export function loadSkill(name: string): SkillMeta | null {
  if (!fs.existsSync(SKILLS_DIR)) return null;

  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const categoryDir = path.join(SKILLS_DIR, entry.name);
    for (const file of fs.readdirSync(categoryDir)) {
      if (file.startsWith("_") || !file.endsWith(".md")) continue;
      const meta = parseSkillFile(path.join(categoryDir, file), true);
      if (meta && meta.name === name) return meta;
    }
  }
  return null;
}

/** Load core skills (_core/*.md) — these are loaded at startup */
export function loadCoreSkills(): SkillMeta[] {
  const coreDir = path.join(SKILLS_DIR, "_core");
  if (!fs.existsSync(coreDir)) return [];

  const skills: SkillMeta[] = [];
  for (const file of fs.readdirSync(coreDir)) {
    if (!file.endsWith(".md")) continue;
    const meta = parseSkillFile(path.join(coreDir, file), true);
    if (meta) skills.push(meta);
  }
  return skills;
}
