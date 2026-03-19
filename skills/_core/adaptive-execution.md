---
name: adaptive-execution
category: _core
description: Enhanced execution patterns for long-running tasks with automatic retries, method adaptation, and minimal user interruption
---

# Adaptive Execution for Long-Running Tasks

When facing complex tasks that might require multiple attempts or different approaches, follow these enhanced execution patterns:

## Auto-Adaptation Strategy

### 1. Multi-Method Approach
- **Always try multiple methods** before asking for user input
- Start with the most likely/standard approach
- Have 2-3 fallback methods ready
- Only escalate to user when all reasonable attempts fail

### 2. Authentication Fallback Chain
For API access issues, try in order:
1. **Direct API with provided credentials** (Basic Auth)
2. **Web session login + API** (Session cookies)
3. **Alternative endpoints** (Different API versions)
4. **Web scraping approach** (Parse HTML if API fails)
5. **Documentation/help lookup** (Find correct method)

Only ask for missing credentials when no method works.

### 3. Progressive Problem Solving
```bash
# Example pattern for web service access:
# Try 1: Direct API
curl -u "user:pass" api/endpoint

# Try 2: Check auth methods
curl -I api/endpoint  # See what auth is required

# Try 3: Web login session
curl -c cookies.txt -d "login_data" login_url
curl -b cookies.txt api/endpoint

# Try 4: Different API version
curl -b cookies.txt api/v2/endpoint

# Try 5: Web scraping fallback
curl -b cookies.txt web_interface | parse_html
```

### 4. Error Analysis and Adaptation
- **Parse error responses** to understand the issue
- **Automatically adjust parameters** based on error messages
- **Try related endpoints** if primary fails
- **Escalate gracefully** with specific questions

## Context Preservation
- Use descriptive variable names and temp files when needed
- Clean up temporary files after task completion
- Preserve successful authentication methods for reuse
- Log what worked for future reference

## User Interaction Minimization
- **Bundle information requests**: Ask for all needed info at once
- **Provide options**: "I need either X or Y to proceed"
- **Show progress**: Indicate what has been tried
- **Be specific**: "I need your JIRA username" not "I need credentials"

## Example Patterns

### Pattern 1: API Access with Unknowns
```bash
# Try common authentication methods
for auth_method in basic token session; do
    result=$(try_auth_method $auth_method)
    if [[ $result == "success" ]]; then
        break
    fi
done
```

### Pattern 2: Service Discovery
```bash
# Find the right endpoint
for endpoint in api/v1 api/v2 rest/api api; do
    if curl -s "$base_url/$endpoint" | grep -q "success_indicator"; then
        working_endpoint="$endpoint"
        break
    fi
done
```

### Pattern 3: Format Adaptation
```python
# Try different data formats
formats = ['json', 'xml', 'text', 'html']
for fmt in formats:
    try:
        data = parse_response(response, fmt)
        if data:
            return data
    except:
        continue
```

## When to Ask Users
Only interrupt the user when:
1. **All reasonable methods exhausted**
2. **Specific missing information identified** (credentials, URLs, etc.)
3. **Ambiguous requirements** need clarification
4. **Permission/access issues** that require user action

## Success Criteria
- Task completes with minimal user interruption
- Multiple approaches attempted automatically
- Clear indication of what worked for future use
- Graceful degradation when perfect solution unavailable

Always prioritize **working solution over perfect solution** when serving user requests.