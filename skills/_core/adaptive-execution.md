---
name: adaptive-execution
category: _core
description: Enhanced execution patterns for long-running tasks with automatic retries, method adaptation, and minimal user interruption
---

# Adaptive Execution for Complex Tasks

When tasks might fail or require different approaches, use these patterns to minimize user interruption.

## Multi-Method Strategy

**Try multiple approaches automatically** before asking users:

1. **Direct approach**: Use provided credentials/standard method
2. **Check requirements**: Discover what authentication/format is needed  
3. **Alternative methods**: Try different API versions, endpoints
4. **Fallback approaches**: Web scraping if APIs fail
5. **Ask user**: Only when all reasonable methods exhausted

## Authentication Chain

For API access issues, try in sequence:
1. **Basic Auth** with provided credentials
2. **Session cookies** via web login
3. **Alternative endpoints** (v2, different paths)
4. **Web interface parsing** as last resort

## Error Adaptation

**Parse errors intelligently**:
- HTTP 401/403 → try different auth methods
- HTTP 404 → try alternative endpoints  
- Rate limiting → implement backoff
- Format errors → try different data formats

**Preserve what works**: Save successful authentication tokens, API endpoints, parameters for reuse.

## Implementation Patterns

### API Discovery
```bash
# Try common endpoints
for endpoint in api/v1 api/v2 rest/api; do
    if curl -s "$base_url/$endpoint" | grep -q "success"; then
        break
    fi
done
```

### Format Adaptation  
```python
# Try different response formats
for format in ['json', 'xml', 'text']:
    try:
        data = parse_response(response, format)
        if data: return data
    except: continue
```

### Progressive Authentication
```bash
# Authentication fallback chain
curl -u "user:pass" api/endpoint ||
curl -c cookies.txt -d "login_data" login_url &&
curl -b cookies.txt api/endpoint ||
curl -s web_interface | parse_html
```

## User Interaction Rules

**Only interrupt when**:
- All reasonable methods failed
- Specific information missing (credentials, URLs)
- Ambiguous requirements need clarification
- Permission issues requiring user action

**When asking**:
- Bundle all questions at once
- Be specific: "I need your GitHub token" not "I need credentials" 
- Show what was tried: "API failed, tried web login, need your password"
- Provide options: "I can try X or Y, or if you have Z that would be fastest"

## Success Criteria

- Task completes with minimal user interruption
- Multiple approaches attempted transparently  
- Clear indication of what worked for future use
- Graceful degradation when perfect solution unavailable

**Prioritize working solutions over perfect solutions.**