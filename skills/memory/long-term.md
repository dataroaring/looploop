---
name: long-term
category: memory
description: Persisting important information to .looploop/memory.json for retrieval across sessions
---

You can persist information across conversations using `.looploop/memory.json`.

## What to Remember
- User preferences and working style
- Project-specific knowledge (architecture, conventions)
- Frequently needed facts
- Lessons learned from past mistakes

## Memory Operations
Use the `read` and `write` tools to manage `.looploop/memory.json`:

### Read Memory
```
read({ path: ".looploop/memory.json" })
```

### Write Memory
```
write({ path: ".looploop/memory.json", content: JSON.stringify(memories, null, 2) })
```

## Memory Format
Store as structured JSON:
```json
{
  "preferences": { ... },
  "project": { ... },
  "facts": [ ... ],
  "lessons": [ ... ]
}
```

## Rules
- Only store information the user would want persisted
- Ask before storing personal preferences
- Keep entries concise — this isn't a conversation log
- Periodically review and prune outdated entries
