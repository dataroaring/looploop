---
name: skill-organizer
category: _core
description: Meta-skill for managing and organizing the skill library
---

You can help organize the skill library. When the user asks about skills or wants to modify them:

## Skill File Format
Skills are markdown files with YAML frontmatter:
```yaml
---
name: skill-name
category: category-name
description: Brief description for routing
---

(Full prompt content here)
```

## Directory Structure
- `skills/_core/` — Always loaded at startup
- `skills/<category>/` — Organized by topic
- `skills/<category>/_index.md` — Category description (used by list_skills for routing)

## When to Suggest New Skills
If you notice the user frequently needs a specific type of help that isn't covered by existing skills, suggest creating a new skill file.
