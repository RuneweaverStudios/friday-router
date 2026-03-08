# Friday Router v2.0 - Parallel Execution

**Intelligent multi-model routing with parallel fast + smart agents**

## Architecture

```
User Prompt (enters once)
    ↓
┌─────────────────────────────────────────────────────┐
│  PARALLEL EXECUTION (both start immediately)        │
│                                                     │
│  Fast Agent              Smart Agent                │
│  ⚡ Streams NOW           🧠 Thinks DEEP             │
│  ↓                       ↓                          │
│  Immediate response      Orchestrates subtasks      │
│  user sees first         with more fast agents      │
│                                                     │
│  [User can read fast     [Background processing]    │
│   response immediately]                             │
└─────────────────────────────────────────────────────┘
```

## API Detection (Automatic)

Friday detects your API from environment variables (priority order):

| Provider | Env Variable | Fast Model | Smart Model |
|----------|--------------|------------|-------------|
| **ZAI** | `ZAI_API_KEY` | GLM 4.7 Flash (free) | GLM 5 |
| **Google** | `GOOGLE_API_KEY` | Gemini 2.0 Flash | Gemini 2.0 Pro |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude 3.5 Haiku | Claude 3.5 Sonnet |
| **OpenRouter** | `OPENROUTER_API_KEY` | Mercury-2 (free) | GLM 5 |

## Usage

```bash
# Basic usage (auto-detects API)
node scripts/route.mjs "Your task"

# Verbose mode (see both agents)
node scripts/route.mjs "Explain React hooks" --verbose

# JSON output
node scripts/route.mjs "Build an API" --json

# Test
./test-v2.sh
```

## How It Works

### 1. Fast Agent (Immediate)
- **Purpose**: Give user something to read immediately
- **Model**: Fastest available (Haiku/Flash/Mercury)
- **Behavior**: Streams response token-by-token
- **User sees**: Answer within 100-500ms

### 2. Smart Agent (Background)
- **Purpose**: Deep analysis + orchestration
- **Model**: Most capable (Opus/Gemini Pro/GLM 5)
- **Behavior**: 
  - Analyzes task complexity
  - Spawns 0-4 fast sub-agents if needed
  - Aggregates results
  - Provides comprehensive answer
- **User sees**: Enriched response after 2-10s

## Parallel Execution

Both agents start **simultaneously**:

```javascript
// Both spawn at the same time
const fastAgent = spawn('node', ['call-api.mjs', task, 'fast']);
const smartAgent = spawn('node', ['call-api.mjs', task, 'smart']);

// Fast streams immediately
fastAgent.stdout.pipe(process.stdout);

// Smart works in background
smartAgent.stdout.on('data', collect);
```

## Model Selection

### Fast Models (Speed priority)
- **ZAI**: `glm-4-flash` (free tier)
- **Google**: `gemini-2.0-flash-exp` (fastest)
- **Anthropic**: `claude-3-5-haiku-20241022` (instant)
- **OpenRouter**: `inception/mercury-2` (free)

### Smart Models (Quality priority)
- **ZAI**: `glm-5` (advanced reasoning)
- **Google**: `gemini-exp-1206` (deep thinking)
- **Anthropic**: `claude-3-5-sonnet-20241022` (balanced)
- **OpenRouter**: `zai/glm-5` (via OpenRouter)

## Examples

```bash
# Simple question (fast model sufficient)
node route.mjs "What is 2+2?"
# → Fast: "4"
# → Smart: (working in background, enriches if needed)

# Medium task (smart model orchestrates)
node route.mjs "Explain React hooks"
# → Fast: Quick explanation (user reads immediately)
# → Smart: Detailed explanation with examples

# Complex task (smart spawns subtasks)
node route.mjs "Build a REST API with authentication"
# → Fast: High-level overview
# → Smart: Architecture + spawns:
#   - Research best practices
#   - Design auth flow
#   - Plan endpoints
#   - Generate code examples
```

## Configuration

### Environment Variables

```bash
# Priority order (first found wins)
export ZAI_API_KEY="..."          # Recommended (cheapest)
export GOOGLE_API_KEY="..."
export ANTHROPIC_API_KEY="..."
export OPENROUTER_API_KEY="..."

# Optional
export FRIDAY_TIMEOUT_MS="60000"  # Default: 60s
```

### Custom Models

Override via environment:

```bash
export FRIDAY_FAST_MODEL="custom-model-id"
export FRIDAY_SMART_MODEL="custom-model-id"
```

## Files

```
scripts/
├── route.mjs         # Main entry point (parallel execution)
├── call-api.mjs      # API caller (handles all providers)
├── detect-api.mjs    # Auto-detect provider from env
└── friday.mjs        # Alternative entry with verbose output

config.json           # Model mappings
test-v2.sh           # Quick test script
```

## Comparison to v1

| Feature | v1 (Sequential) | v2 (Parallel) |
|---------|----------------|---------------|
| **Response time** | 2-5s (wait for triage) | 100-500ms (immediate) |
| **User experience** | Waits, then sees answer | Reads immediately |
| **Triage** | Sequential step | Runs in parallel |
| **API detection** | Manual config | Automatic |
| **Provider support** | OpenRouter only | ZAI/Google/Anthropic/OR |

## Benefits

1. **Immediate feedback** - User sees response in 100-500ms
2. **Deep analysis** - Smart model thinks in background
3. **Auto-detection** - No config needed
4. **Cost optimization** - Uses your cheapest API
5. **Graceful degradation** - Falls back if smart fails

## Testing

```bash
# Quick test
./test-v2.sh

# Manual test
node scripts/route.mjs "What is machine learning?" --verbose
```

## Cost Comparison

| Provider | Fast Model | Smart Model | Cost per 1K calls |
|----------|------------|-------------|-------------------|
| **ZAI** | Free tier | Membership | ~$0 (membership) |
| **Google** | $0.001 | $0.007 | ~$8 |
| **Anthropic** | $0.025 | $0.15 | ~$175 |
| **OpenRouter** | Free | $0.001 | ~$1 |

**Recommendation**: Use ZAI API for best value.

## Troubleshooting

**No API key detected:**
```bash
# Set your API key
export ZAI_API_KEY="your-key-here"

# Verify
node scripts/detect-api.mjs
```

**Timeout errors:**
```bash
# Increase timeout
export FRIDAY_TIMEOUT_MS="120000"  # 2 minutes
```

**Rate limits:**
- ZAI has generous rate limits
- OpenRouter can hit 429s on free models
- Anthropic/Google have pay-per-use limits

## License

MIT

## Author

Ghost Malone 👻

---

**Friday Router v2.0 - Because waiting is for robots.**
