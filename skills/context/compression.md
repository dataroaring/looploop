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

## Writing Compression: Reduce Token Count ~50%
When writing summaries, actively strip low-value tokens while preserving semantics:

### Remove
- Filler words: basically, actually, just, really, let me check, I'll help you
- Redundant connectors: furthermore, additionally, also, moreover
- Politeness/meta phrases: "I'll check this for you", "Let me look into that"
- Verbose phrasing: "in this process" → remove; "it should be noted that" → remove
- Repeated context: if a fact was stated once, don't restate

### Keep
- Proper nouns, URLs, numbers, dates, config values
- Causal relationships (A → B)
- Decisions and their reasons
- Error messages and key tool outputs

### Example
Before (35 tokens):
> We checked the ForgeCode website and discovered they currently don't have a dedicated pricing page, with pricing information actually only existing in a July 2025 blog post

After (18 tokens):
> ForgeCode: no dedicated pricing page, only in blog post (July 2025)

Target: ~50% token reduction vs naive summary.