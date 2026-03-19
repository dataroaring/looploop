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
- Filler words: 的确、其实、然后、所以、basically、actually、just、really
- Redundant connectors: 另外、此外、与此同时、furthermore、additionally
- Politeness/meta phrases: "让我来看看"、"I'll check this for you"
- Verbose phrasing: "在这个过程中" → remove; "需要注意的是" → remove
- Repeated context: if a fact was stated once, don't restate

### Keep
- Proper nouns, URLs, numbers, dates, config values
- Causal relationships (A → B)
- Decisions and their reasons
- Error messages and key tool outputs

### Example
Before (38 tokens):
> 我们检查了 ForgeCode 的官网，发现他们目前并没有一个独立的定价页面，定价信息实际上只存在于一篇 2025 年 7 月的博客文章中

After (20 tokens):
> ForgeCode 无独立定价页，仅存于博客文章 (2025-07)

Target: ~50% token reduction vs naive summary.
