---
name: subagent-decomposition
category: _core
description: Strategic principles for maximizing subagent decomposition - when and how to split tasks for parallel execution
---

# Subagent Decomposition Strategy

## Core Principle: Maximize Parallelization

**Always prefer subagent decomposition when possible**. The goal is to identify and split any task that can benefit from parallel execution.

## Auto-Detection Triggers

### Immediate Decomposition (High Confidence)
**Always decompose when detecting:**

1. **Multiple Similar Items** (2+ items of same type):
   - "Analyze these JIRA issues: A, B, C" → 3 subagents
   - "Review files: x.js, y.js, z.js" → 3 subagents
   - "Test configurations: dev, staging, prod" → 3 subagents

2. **List/Batch Operations**:
   - "Process all files in directory" → 1 subagent per file
   - "Check status of all services" → 1 subagent per service
   - "Generate reports for each module" → 1 subagent per module

3. **Comparison Tasks**:
   - "Compare React vs Vue vs Angular" → 3 evaluation subagents
   - "Evaluate multiple solutions" → 1 subagent per solution
   - "Benchmark different approaches" → 1 subagent per approach

### Potential Decomposition (Evaluate)
**Consider decomposing when detecting:**

1. **Complex Single Tasks**:
   - "Analyze this complex system failure" → Separate subagents for logs, metrics, config
   - "Research topic X thoroughly" → Subagents for different information sources
   - "Design architecture for Y" → Subagents for different components/layers

2. **Multi-Domain Analysis**:
   - "Security audit of application" → Subagents for different security aspects
   - "Performance optimization analysis" → Subagents for different bottlenecks
   - "Code quality review" → Subagents for different quality dimensions

## Decomposition Patterns

### Pattern 1: Direct Item Splitting
```
Input: "Analyze JIRA-1, JIRA-2, JIRA-3"
Decomposition: 3 subagents, each handling 1 JIRA issue
Parallelization: Perfect (3x speedup)
```

### Pattern 2: Aspect-Based Splitting
```
Input: "Complete security audit of web application"
Decomposition: 
- Subagent 1: Authentication/authorization analysis
- Subagent 2: Input validation and XSS analysis  
- Subagent 3: Database security analysis
- Subagent 4: Infrastructure security analysis
Parallelization: High (4x speedup)
```

### Pattern 3: Layer-Based Splitting
```
Input: "Debug performance issues in microservices system"
Decomposition:
- Subagent 1: Frontend performance analysis
- Subagent 2: API gateway analysis
- Subagent 3: Service-to-service communication analysis
- Subagent 4: Database performance analysis
Parallelization: High (4x speedup)
```

### Pattern 4: Source-Based Splitting
```
Input: "Research best practices for container orchestration"
Decomposition:
- Subagent 1: Official documentation analysis
- Subagent 2: Industry case studies analysis
- Subagent 3: Community best practices analysis
- Subagent 4: Performance benchmarks analysis
Parallelization: High (4x speedup)
```

## Independence Verification

### Questions to Verify Decomposition Viability:
1. **Can each subagent complete its task without waiting for others?** ✅
2. **Does each subagent have access to all data it needs?** ✅  
3. **Are the results independently valuable?** ✅
4. **Can tasks be processed in any order?** ✅

If all answers are YES → Decompose into subagents
If any answer is NO → Use main agent

### Anti-Patterns (Avoid Decomposition):
- ❌ **Sequential Dependencies**: Task B requires output from Task A
- ❌ **Shared State Modification**: Multiple subagents modifying same resource
- ❌ **Real-time Coordination**: Tasks need to synchronize during execution
- ❌ **Single Atomic Operation**: Task cannot be meaningfully split

## Aggressive Decomposition Guidelines

### Look for Hidden Parallelization Opportunities

1. **Single Complex Request → Multiple Angles**:
   ```
   "How to improve our API performance?"
   →
   - Subagent 1: Database optimization analysis
   - Subagent 2: Caching strategy analysis  
   - Subagent 3: Network/CDN optimization analysis
   - Subagent 4: Code-level performance analysis
   ```

2. **Documentation Task → Multiple Outputs**:
   ```
   "Document our authentication system"
   →
   - Subagent 1: Developer integration guide
   - Subagent 2: Administrator configuration guide
   - Subagent 3: Troubleshooting guide
   - Subagent 4: Security considerations guide
   ```

3. **Investigation Task → Multiple Evidence Sources**:
   ```
   "Why is our service failing intermittently?"
   →
   - Subagent 1: Application logs analysis
   - Subagent 2: System metrics analysis
   - Subagent 3: Network connectivity analysis
   - Subagent 4: Database performance analysis
   ```

## Decomposition Decision Tree

```
Is task about multiple similar items? → YES → Decompose by item
↓ NO
Can task be split by domain/aspect? → YES → Decompose by domain  
↓ NO
Can task be split by information source? → YES → Decompose by source
↓ NO
Is task complex enough to benefit from focused analysis? → YES → Decompose by component
↓ NO
Use main agent (task too simple for decomposition)
```

## Success Metrics

### Optimal Decomposition Achieved When:
- **Minimal Sequential Dependencies**: Each subagent works independently
- **Balanced Workload**: Each subagent has roughly equivalent complexity
- **Clear Success Criteria**: Each subagent has well-defined deliverables
- **Meaningful Parallelization**: Total time significantly reduced

### Signs of Over-Decomposition:
- Subagents with trivial tasks (< 30 seconds work)
- Too much coordination overhead
- Fragmented results that are hard to synthesize

### Signs of Under-Decomposition:
- Single subagent doing multiple independent analyses
- Main agent handling tasks that could be parallelized
- Linear scaling instead of parallel scaling

## Implementation Strategy

1. **Start with Obvious Decomposition**: Multiple similar items
2. **Look for Hidden Opportunities**: Complex single tasks with multiple aspects
3. **Verify Independence**: Ensure no sequential dependencies
4. **Prefer Over-Decomposition**: Better to have more smaller subagents than fewer large ones
5. **Let Main Agent Synthesize**: Use main agent to combine subagent results

## Key Principle

**When in doubt, decompose.** The benefits of parallelization almost always outweigh the minimal coordination overhead. The goal is maximum parallel execution efficiency.