# Friday Router - Multi-Model Routing Agent

## Overview

Friday Router is an intelligent task routing system that automatically classifies task complexity and routes them to the most appropriate GLM model via OpenRouter.

**New in v2.0:** Model transparency and contextual follow-up questions!

## Features

### 🔄 Model Transparency
Every routed task shows the complete model selection path:
- Triage model (complexity classification)
- Orchestrator model (execution planning)
- Sub-agent model (task execution)

### 💬 Follow-up Questions
Optional `--follow-up` flag generates contextual follow-up questions based on:
- Task type and complexity
- Conversation context
- Related topics worth exploring

## Architecture

```
┌─────────────┐
│   Task In   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  GLM 4.7 Flash  │  TRIAGE
│  (Fast Class.)  │  Classify: simple/medium/complex
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   GLM 5.0       │  ORCHESTRATOR
│   (Router)      │  Select model + configure
└────────┬────────┘
         │
    ┌────┴────┬─────────┐
    ▼         ▼         ▼
┌───────┐ ┌────────┐ ┌────────┐
│ Flash │ │ GLM 4  │ │ GLM 5  │
│(simple│ │(medium)│ │(complex)│
└───────┘ └────────┘ └────────┘
```

## Models Used

- **Triage**: `z-ai/glm-4.7-flash` - Ultra-fast classification
- **Orchestrator**: `z-ai/glm-5` - Smart routing decisions
- **Simple Tasks**: `z-ai/glm-4.7-flash` - Quick responses
- **Medium Tasks**: `z-ai/glm-4.7` - Balanced performance
- **Complex Tasks**: `z-ai/glm-5` - Maximum capability

## Task Complexity Classification

### Simple (Flash)
- Definitions, basic questions
- Simple conversions
- Quick lookups
- Single-step operations
- **Max tokens**: 500
- **Typical time**: <1s

### Medium (GLM 4)
- Explanations with examples
- Comparisons
- Summaries
- Code reviews
- Multi-step analysis
- **Max tokens**: 2000
- **Typical time**: 2-5s

### Complex (GLM 5)
- Architecture design
- Implementation from scratch
- Complex refactoring
- Multi-component systems
- Deep analysis
- **Max tokens**: 4000
- **Typical time**: 5-15s

## Usage

### CLI
```bash
# Direct task with model transparency
node scripts/route.mjs "What is machine learning?"

# With follow-up question
node scripts/route.mjs "Explain React hooks" --follow-up

# With context
node scripts/route.mjs "Explain React hooks" --context "frontend developer"

# With file
node scripts/route.mjs "Review this code" --file ./code.js

# Debug mode (shows all stages)
node scripts/route.mjs "Build an API" --debug
```

### Example Output with Model Transparency
```
🔄 Routing Decision:
  Triage: z-ai/glm-4.7-flash (complexity: medium)
  Orchestrator: z-ai/glm-5
  Sub-agent: z-ai/glm-5

✅ Task dispatched to GLM 5

[Response content...]

💬 Want me to show you some React hooks examples?
```

### Programmatic
```javascript
import { routeTask } from './scripts/route.mjs';

const result = await routeTask({
  task: "Build a REST API",
  context: "Node.js backend",
  files: ["./server.js"]
});

console.log(result);
// {
//   response: "...",
//   metadata: {
//     complexity: "complex",
//     model: "z-ai/glm-5",
//     tokens: { input: 150, output: 1200 },
//     time: 8423
//   }
// }
```

## Response Format

All responses include:

```javascript
{
  response: string,          // The actual response
  metadata: {
    complexity: "simple" | "medium" | "complex",
    model: string,           // Model used
    tokens: {
      input: number,
      output: number
    },
    time: number,            // Total time in ms
    retries: number,         // Retry attempts
    routing_path: string[]   // ["triage", "orchestrator", "agent"]
  }
}
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--stream` | Stream the final answer token-by-token |
| `--raw` | Output structured JSON (for piping) |
| `--stdin` | Read task from stdin |
| `--skip-triage` | Treat as medium complexity |
| `--force-simple` | Skip triage + orchestrate, answer directly |
| `--debug` | Show all intermediate pipeline outputs |
| `--follow-up` | Generate contextual follow-up question |

## Error Handling

- **Automatic retries**: Up to 3 attempts with exponential backoff
- **Fallback model**: If preferred model fails, uses GLM 4 Flash
- **Timeout protection**: 60s max per request
- **Error metadata**: Full error details in response

## Configuration

Edit `config.json` to customize:

```json
{
  "complexity_thresholds": {
    "simple": {
      "max_tokens": 500,
      "keywords": ["define", "what is"],
      "max_steps": 1
    }
  },
  "routing": {
    "max_retries": 3,
    "timeout_ms": 60000,
    "fallback_model": "zhipu/glm-4-flash"
  }
}
```

## Environment Variables

Required:
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Optional:
```bash
TRIAGE_MODEL=z-ai/glm-4.7-flash     # Override triage model
ORCHESTRATOR_MODEL=z-ai/glm-5       # Override orchestrator model
DISPATCH_MODEL=z-ai/glm-5           # Override dispatch model
FRIDAY_LOG_LEVEL=debug              # Logging level
FRIDAY_TIMEOUT=30000                # Override timeout
```

## Examples

### Simple Task
```bash
$ node scripts/route.mjs "Define API"

🔄 Routing Decision:
  Triage: z-ai/glm-4.7-flash (complexity: simple)
  Orchestrator: z-ai/glm-5
  Sub-agent: z-ai/glm-4.7-flash

✅ Task dispatched to GLM 4.7 Flash

Response: "API stands for Application Programming Interface..."
```

### Medium Task with Follow-up
```bash
$ node scripts/route.mjs "Compare REST vs GraphQL" --follow-up

🔄 Routing Decision:
  Triage: z-ai/glm-4.7-flash (complexity: medium)
  Orchestrator: z-ai/glm-5
  Sub-agent: z-ai/glm-4.7

✅ Task dispatched to GLM 4.7

Response: "REST and GraphQL are both API design approaches..."

💬 Want me to show you code examples for both?
```

### Complex Task
```bash
$ node scripts/route.mjs "Design a microservices architecture for an e-commerce platform"

🔄 Routing Decision:
  Triage: z-ai/glm-4.7-flash (complexity: complex)
  Orchestrator: z-ai/glm-5
  Sub-agent: z-ai/glm-5

✅ Task dispatched to GLM 5

Response: "For an e-commerce microservices architecture..."
```

## Performance Optimization

- **Triage caching**: Similar tasks skip re-classification
- **Parallel routing**: Orchestrator preps while triage finishes
- **Model warmup**: Maintains connection pools
- **Smart batching**: Groups similar tasks

## Monitoring

Enable logging to track:
- Routing decisions
- Model performance
- Error rates
- Token usage

```bash
FRIDAY_LOG_LEVEL=debug node scripts/route.mjs "task"
```

## Integration with Other Skills

Friday Router works well with:
- **brain**: Store routing patterns for learning
- **smart-compact**: Efficient context management
- **orchestrator**: Delegate to other agents

## Future Enhancements

- [x] Model transparency in routing output
- [x] Contextual follow-up questions
- [ ] Learn from past routing decisions
- [ ] Cost optimization (prefer cheaper models)
- [ ] A/B testing different models
- [ ] Streaming responses
- [ ] Batch processing mode
