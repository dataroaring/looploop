# looploop

Minimalist agent framework where code is just loops + tool pipelines. All decisions are driven by the model.

## Principles

- **Code zero decisions** — Code provides the loop and tools (pure I/O pipeline)
- **Model all decisions** — Skill selection, subagent spawning, context compression — all LLM-driven
- **Progressive disclosure** — Skills discovered and activated on demand, never preloaded
- **Context isolation** — Deep work via isolated subagents with full tool access
- **Session awareness** — Auto-detects topic switches and compresses stale context
- **Full history** — Sessions and subagent runs persisted for traceability
- **OTel observability** — All runtime data saved in OpenTelemetry format

## Quick Start

```bash
npm install
npm link          # registers the 'looploop' command globally
export ANTHROPIC_API_KEY=sk-ant-...
looploop
```

Or without global install:

```bash
npm start
```

## Usage

Type messages at the `>` prompt. The agent streams responses and uses tools autonomously.

### Commands

| Command | Description |
|---------|-------------|
| `/context` | Show session stats (tokens, cost, tool calls, active skills) |
| `/context detail` | Browse full message history with token/cost per turn |
| `/browse` | Browse tool outputs and responses from the last run |
| `/sessions` | List saved sessions |
| `/resume <id>` | Resume a previous session (restores messages and model) |
| `/load <id>` | Load messages from a previous session without resuming |
| `/subagents` | List all subagent runs |
| `/subagents <id>` | View details of a specific subagent run |
| `/model` | Show current model |
| `/model list` | List available models |
| `/model <provider/id>` | Switch model (e.g. `/model anthropic/claude-sonnet-4-20250514`) |
| `/noauto` | Disable automatic topic-switch detection for this session |
| `/exit` | Quit |

### Session Awareness

The agent automatically detects when your input is unrelated to the current conversation. When a topic switch is detected, it compresses the old context and starts fresh — no stale tokens wasted.

| Input | Behavior |
|-------|----------|
| Normal message | Agent checks relevance, auto-compresses if unrelated |
| `+ <message>` | Force continue in current context, skip relevance check |
| "new topic" / "start fresh" | Explicitly request a new context |
| `/noauto` | Disable auto-detection for the rest of the session |

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

The entry point (`src/index.ts`) is a readline loop, agent creation, and event subscriptions. No routing logic, no conditionals on tool results.

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
| `spawn_subagent` | Create an isolated sub-agent with bash/read/write/skill tools |

### External
| Tool | Description |
|------|-------------|
| `read` | Read a file |
| `write` | Write a file |
| `bash` | Execute a shell command |

## Subagents

Subagents are isolated agent instances spawned for focused tasks:

- **Own context** — Independent message history, no pollution of parent context
- **Full tools** — Access to bash, read, write, and skill tools (no nesting)
- **Model inheritance** — Uses the same model as the parent agent
- **Persisted** — Every run saved to `.looploop/subagents/` with task, result, messages, and parent session link
- **Traceable** — View history via `/subagents`, inspect details via `/subagents <id>`

## Skills

Skills are markdown files with YAML frontmatter, organized by category:

```
skills/
├── _core/              # Loaded at startup into system prompt
│   ├── loop.md         # Core agent behavior + session awareness
│   └── skill-organizer.md
├── debugging/          # Activated on demand
│   └── investigate-first.md
├── reasoning/
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
name: my-skill
category: reasoning
description: One-line description used for search routing
---

Your prompt content here. This is injected into context
when the model calls activate_skill("my-skill").
```

### How Skills Work

1. `_core/` skills are loaded into the system prompt at startup
2. Category `_index.md` files provide routing signals for the model
3. The model discovers skills via `list_skills` / `search_skills`
4. Skills are loaded into context via `activate_skill` when needed

## Persistence

```
.looploop/
├── sessions/           # Main conversation sessions
│   └── 2026-03-19-0110-x4ab.json
├── subagents/          # Subagent run history
│   └── sub-2026-03-19-0215-k3bc.json
├── traces/             # OpenTelemetry trace files
│   └── trace-1773899813079.json
└── history             # Readline command history
```

Sessions and subagent runs are persisted automatically. Subagent sessions include `parentSessionId` for linking back to the calling session.

## Observability

All runtime data is recorded in OpenTelemetry format.

### Remote Collector

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to send traces to a remote collector (Jaeger, Grafana, etc.):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
looploop
```

### In-Session Metrics

Use `/context` or the `get_context_info` tool to see live metrics:
- Token consumption (input/output) and cost
- Tool call counts and active skills
- Compression events and average LLM latency

## Project Structure

```
src/
├── index.ts            # Entry: Agent + REPL + event subscriptions
├── types.ts            # SkillMeta, SkillGroup, ContextStats
├── display.ts          # Terminal output and browsing
├── session.ts          # Session persistence
├── telemetry.ts        # OTel initialization + file exporter + metrics
├── skill-loader.ts     # Directory scanning + frontmatter parsing
└── tools/
    ├── index.ts         # Exports all tools
    ├── list-skills.ts
    ├── search-skills.ts
    ├── activate-skill.ts
    ├── get-context-info.ts
    ├── replace-messages.ts
    ├── spawn-subagent.ts  # Subagent with tool access + session persistence
    ├── read.ts
    ├── write.ts
    └── bash.ts
```

## Adding Skills

Create a `.md` file in `skills/<category>/`:

```markdown
---
name: my-skill
category: my-category
description: One-line description used for search routing
---

Prompt content here.
```

Add `_index.md` to new categories to help the model route:

```markdown
Description of what this category covers.
```

## License

MIT
