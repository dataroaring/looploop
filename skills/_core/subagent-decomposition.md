---
name: subagent-decomposition
category: _core
description: Strategic principles for maximizing subagent decomposition - when and how to split tasks for parallel execution
---

# Subagent Decomposition Strategy

**Core principle**: When in doubt, decompose. Parallelization benefits almost always outweigh coordination costs.

## Decomposition Triggers

### Always Decompose
1. **Multiple similar items** (2+): "Analyze JIRA-1, JIRA-2, JIRA-3" → 3 subagents
2. **Batch operations**: "Process all files in /src" → 1 subagent per file
3. **Comparisons**: "Compare React vs Vue" → 2 evaluation subagents

### Consider Decomposing  
1. **Complex single tasks**: "Security audit" → auth + validation + infrastructure + database subagents
2. **Multi-domain analysis**: "Performance issues" → frontend + API + database + network subagents
3. **Research tasks**: "Best practices for X" → docs + case studies + community + benchmarks subagents

## Decomposition Patterns

### By Item
```
"Analyze JIRA-1, JIRA-2, JIRA-3" → 3 subagents (perfect parallelization)
```

### By Aspect
```
"Security audit of web app" → 4 subagents:
- Authentication/authorization  
- Input validation/XSS
- Database security
- Infrastructure security
```

### By Layer
```
"Debug performance in microservices" → 4 subagents:
- Frontend performance
- API gateway
- Service communication  
- Database performance
```

### By Source
```
"Research container orchestration" → 4 subagents:
- Official documentation
- Industry case studies  
- Community practices
- Performance benchmarks
```

## Independence Check

Before decomposing, verify each subagent can work independently:

1. **Can complete without waiting for others?** ✅
2. **Has access to all needed data?** ✅  
3. **Results are independently valuable?** ✅
4. **Can process in any order?** ✅

If any answer is NO → use main agent instead.

## Anti-Patterns

Don't decompose when:
- **Sequential dependencies**: Task B needs Task A output
- **Shared state modification**: Multiple subagents writing to same resource
- **Real-time coordination**: Tasks need synchronization
- **Trivial tasks**: Less than 30 seconds work each

## Decision Tree

```
Multiple similar items? → YES → Decompose by item
↓ NO
Multi-aspect task? → YES → Decompose by aspect/domain
↓ NO  
Complex research? → YES → Decompose by information source
↓ NO
Use main agent
```

## Quality Indicators

**Good decomposition**:
- Each subagent has clear deliverables
- Balanced workload across subagents
- Meaningful time savings through parallelization
- Results easy to synthesize

**Poor decomposition**:
- Trivial subtasks
- High coordination overhead
- Fragmented results hard to combine
- Sequential dependencies between subagents