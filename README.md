# looploop

Minimalist agent framework where code is just loops + tool pipelines. All decisions are driven by the model.

## Principles

- **Code zero decisions** — Code provides the loop and tools (pure I/O pipeline)
- **Model all decisions** — Skill selection, subagent spawning, context compression — all LLM-driven
- **Progressive disclosure** — Skills discovered and activated on demand, never preloaded
- **Context isolation** — Deep work and compression via isolated subagents
- **Full history** — All messages retained by default; the model decides when to compress
- **OTel observability** — All runtime data saved in OpenTelemetry format

## Quick Start

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

## Usage

Type messages at the `>` prompt. The agent streams responses and uses tools autonomously.

### Commands

| Command | Description |
|---------|-------------|
| `/context` | Show session stats (tokens, cost, tool calls, active skills) |
| `/exit` | Quit |

### Example Session

```
> What files are in the current directory?
[agent uses bash tool to ls, responds with listing]

> /context
  LLM calls: 2
  Total tokens: 3,200 (in: 2,800, out: 400)
  Total cost: $0.0120
  Messages: 4
  Active skills: none
  Tool calls: bash: 1
  Avg latency: 1100ms per LLM call
```

## Architecture

```
User input → readline → agent.prompt() → LLM → tool calls → LLM → streamed response
                              ↑                     |
                        system prompt           tools execute
                     (from _core/ skills)      (file I/O, shell, skills, subagents)
```

The entry point (`src/index.ts`) is ~120 lines: a readline loop, agent creation, and OTel event subscriptions. No routing logic, no conditionals on tool results.

## Tools

The model has access to 9 tools:

### Skill Management
| Tool | Description |
|------|-------------|
| `list_skills` | Browse skill categories and their contents |
| `search_skills` | Search skills by keyword |
| `activate_skill` | Load a skill's full prompt content |

### Context Management
| Tool | Description |
|------|-------------|
| `get_context_info` | Get token usage, message count, and session stats |
| `replace_messages` | Compress old messages into a summary |

### Subagent
| Tool | Description |
|------|-------------|
| `spawn_subagent` | Create an isolated sub-agent for focused tasks |

### External
| Tool | Description |
|------|-------------|
| `read` | Read a file |
| `write` | Write a file |
| `bash` | Execute a shell command |

## Skills

Skills are markdown files with YAML frontmatter, organized in a MoE (Mixture of Experts) hierarchy:

```
skills/
├── _core/              # Loaded at startup into system prompt
│   ├── loop.md         # Core agent behavior
│   └── skill-organizer.md
├── reasoning/          # Activated on demand by the model
│   ├── thinking.md
│   ├── analysis.md
│   └── planning.md
├── interaction/
│   ├── ask-questions.md
│   └── clarification.md
├── context/
│   ├── compression.md
│   └── focus.md
└── memory/
    ├── short-term.md
    └── long-term.md
```

### Skill Format

```markdown
---
name: thinking
category: reasoning
description: Step-by-step reasoning for complex multi-step tasks
---

(Prompt content loaded when activated)
```

### How Skills Work

1. `_core/` skills are loaded into the system prompt at startup
2. Category `_index.md` files provide routing signals for the model
3. The model discovers skills via `list_skills` / `search_skills`
4. Skills are loaded into context via `activate_skill` when needed

## Observability

All runtime data is recorded in OpenTelemetry format.

### Trace Files

Traces are written to `.looploop/traces/` as OTLP JSON files. Each file contains spans for:
- Agent runs (root trace)
- LLM turns (with model, token counts, latency, cost)
- Tool executions (with name and arguments)
- Subagent runs (child traces)

### Remote Collector

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to also send traces to a remote collector (Jaeger, Grafana, etc.):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
npm start
```

### In-Session Metrics

Use `/context` or the `get_context_info` tool to see live metrics:
- Token consumption (input/output)
- Cost tracking
- Tool call counts
- Active skills
- Compression events
- Average LLM latency

## Project Structure

```
src/
├── index.ts            # Entry: Agent + REPL + OTel event subscriptions
├── types.ts            # SkillMeta, SkillGroup, ContextStats
├── telemetry.ts        # OTel initialization + file exporter + metric helpers
├── skill-loader.ts     # Directory scanning + frontmatter parsing
└── tools/
    ├── index.ts         # Exports all tools
    ├── list-skills.ts
    ├── search-skills.ts
    ├── activate-skill.ts
    ├── get-context-info.ts
    ├── replace-messages.ts
    ├── spawn-subagent.ts
    ├── read.ts
    ├── write.ts
    └── bash.ts
```

## Dependencies

- [`@mariozechner/pi-agent-core`](https://github.com/badlogic/pi-mono) — Agent loop
- [`@mariozechner/pi-ai`](https://github.com/badlogic/pi-mono) — LLM abstraction (model registry, streaming, tool validation)
- [`@sinclair/typebox`](https://github.com/sinclairzx81/typebox) — Tool parameter schemas
- [`gray-matter`](https://github.com/jonschlinkert/gray-matter) — YAML frontmatter parsing
- [`@opentelemetry/*`](https://opentelemetry.io/) — Trace/span/metric infrastructure

## Adding Skills

Create a `.md` file in the appropriate `skills/<category>/` directory:

```markdown
---
name: my-skill
category: reasoning
description: One-line description used for search routing
---

Your prompt content here. This is injected into context
when the model calls activate_skill("my-skill").
```

Add a `_index.md` to new categories:

```markdown
---
description: What this category covers — helps the model route to the right skills
---
```

## License

MIT
