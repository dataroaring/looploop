---
name: investigate-first
category: debugging
description: Maximize information gathering from existing sources before local reproduction. Applies to CI failures, production incidents, bug reports, etc.
---

# Investigate First, Reproduce Second

When diagnosing any failure (CI, runtime, production), **exhaust all available information sources before attempting local reproduction**. Reproduction is expensive and often unnecessary if you gather enough context.

## Core Principle

> 尽可能多的挖掘现场信息，再次才是复现。
> (Extract as much information as possible from the scene first; reproduction comes second.)

## Information Gathering Priority

### 1. Direct Error Output (Highest Priority)
- Read the **actual error message** in full — don't skim
- Get the **complete log**, not just the summary/annotation
- Look for **stack traces**, **line numbers**, **error codes**

### 2. CI/GitHub Actions Failures
The REST API and the Web UI expose **different levels of detail**:

| Source | What you get | Access |
|--------|-------------|--------|
| `check-runs/{id}/annotations` API | Only annotations (often just "exit code 1") | Public |
| `actions/jobs/{id}/logs` API | Full logs as text | **Requires admin** |
| `actions/runs/{id}/logs` API | Full logs as zip | **Requires admin** |
| **GitHub web UI** (HTML page) | Full step-by-step logs rendered in browser | **Public for public repos** |

**Key lesson**: When API log endpoints return 403, **scrape the HTML page instead**:
```bash
# The HTML job page is publicly readable even when API logs are not
curl -sL "https://github.com/{owner}/{repo}/actions/runs/{run_id}/job/{job_id}" | \
  grep -oP 'Error:.*' | head -20
```

Or extract structured log content:
```bash
# GitHub renders logs in the page — look for error patterns
curl -sL "{html_url_of_job}" | \
  grep -iE '(error|failure|exception|fatal|FAILED)' | \
  sed 's/<[^>]*>//g' | head -30
```

### 3. PR/Commit Context
- Read the **full diff** — what files changed, what was added/removed
- Check for **obvious mistakes**: `.orig` files, merge conflict markers, unintended changes
- Review the **commit messages** for clues about what was attempted
- Check **PR comments** — reviewers or bots may have already identified issues

### 4. Build/Test Configuration
- Read the **CI workflow file** to understand what's being checked
- Understand the **exact command** being run (e.g., `mvn checkstyle:check`)
- Check if there's a **config file** for the tool (e.g., `checkstyle.xml`, `.eslintrc`)

### 5. Historical Context
- Has this **same check failed before** on other PRs? How was it fixed?
- Is this a **flaky test** or a deterministic failure?
- Check the **base branch** — is the failure pre-existing?

## Anti-Patterns to Avoid

1. **Jumping to local reproduction** before reading all available logs
2. **Giving up on logs** after one API endpoint returns 403 — try other endpoints and HTML scraping
3. **Guessing the cause** from the diff alone without confirming with actual error output
4. **Only reading annotations/summaries** instead of full log output
5. **Assuming the CI name tells you everything** — "CheckStyle failed" doesn't tell you which rule or file

## Checklist Before Reproducing Locally

- [ ] Read the full error message from CI logs (API or HTML scrape)
- [ ] Identified the exact file, line, and rule/check that failed
- [ ] Reviewed the full PR diff for obvious issues
- [ ] Checked CI workflow to understand what command runs
- [ ] Checked PR comments and review feedback
- [ ] Only if the above is insufficient → reproduce locally
