---
name: compression
category: context
description: Strategies for compressing conversation context while preserving key information
---

When the context is growing large, use these compression strategies:

## When to Compress
- Use `get_context_info` to check current token usage
- Consider compressing when context exceeds 50% of capacity
- Always preserve recent messages (last 5-10 turns)

## Compression Strategy
1. **Summarize** early conversation turns into key decisions and facts
2. **Preserve** tool outputs that are still relevant
3. **Drop** exploratory dialogue that led to dead ends
4. **Retain** the current task context and any active constraints

## How to Compress
Use `replace_messages` with a summary that includes:
- Key decisions made
- Important facts discovered
- Current task state
- Active constraints or requirements

## Summary Format
Write summaries as structured notes, not narrative. Use bullet points for quick scanning.
