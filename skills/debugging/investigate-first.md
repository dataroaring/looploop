---
name: investigate-first
category: debugging
description: Maximize information gathering from existing sources before local reproduction. Applies to CI failures, production incidents, bug reports, etc.
---

# Investigate First, Reproduce Second

**Core principle**: Exhaust all available information sources before attempting local reproduction. Reproduction is expensive and often unnecessary.

## Investigation Priority

### 1. Direct Error Output (Start Here)
- Read the **complete error message** — don't skim
- Get **full logs**, not just summaries
- Look for **stack traces**, **line numbers**, **error codes**

### 2. CI/GitHub Actions Failures

| Data Source | Content | Access Level |
|-------------|---------|--------------|
| API annotations | Summary only ("exit code 1") | Public |
| API full logs | Complete logs | Admin required |
| **HTML page** | Full logs in browser | **Public** |

**Key insight**: When API logs return 403, scrape the HTML page:

```bash
# GitHub job pages are publicly readable
curl -sL "github.com/{owner}/{repo}/actions/runs/{run_id}/job/{job_id}" | \
  grep -iE '(error|failure|exception|fatal)' | \
  sed 's/<[^>]*>//g' | head -20
```

### 3. Code Context
- **Review full diff**: what changed, what was added/removed
- **Check for obvious issues**: merge conflicts, `.orig` files, typos
- **Read commit messages**: understand what was attempted
- **Check PR comments**: reviewers may have spotted the issue

### 4. Configuration Context  
- **CI workflow file**: understand what command runs
- **Tool config files**: checkstyle.xml, .eslintrc, etc.
- **Exact command executed**: often different from workflow name

### 5. Historical Context
- **Previous failures**: has this check failed before? How was it fixed?
- **Flaky vs deterministic**: pattern of failure
- **Base branch status**: is the issue pre-existing?

## Investigation Checklist

Complete before attempting local reproduction:

- [ ] Read full error from logs (HTML scrape if API fails)
- [ ] Identified exact file/line/rule that failed  
- [ ] Reviewed complete PR diff
- [ ] Understood CI command and configuration
- [ ] Checked PR comments and history
- [ ] Only if insufficient → reproduce locally

## Anti-Patterns

Avoid these common mistakes:
- Jumping to reproduction without reading available logs
- Giving up after one API endpoint fails — try HTML scraping
- Guessing from diff without confirming with error output
- Reading only summaries instead of full logs  
- Assuming CI job name tells you everything