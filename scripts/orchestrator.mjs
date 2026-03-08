#!/usr/bin/env node

/**
 * Orchestrator Module - GLM 5.0
 * Routes tasks to appropriate models based on complexity
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openRouter = new Anthropic({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const ORCHESTRATOR_MODEL = 'z-ai/glm-5';

// Load config
let config = null;
async function getConfig() {
  if (!config) {
    const configPath = join(__dirname, '..', 'config.json');
    const configData = await readFile(configPath, 'utf-8');
    config = JSON.parse(configData);
  }
  return config;
}

const ORCHESTRATOR_PROMPT = `You are a routing orchestrator. Based on the task complexity and requirements, determine the best execution strategy.

Complexity level: {complexity}

Available models:
- simple: z-ai/glm-4.7-flash (fast, cheap, good for basic tasks)
- medium: z-ai/glm-4.7 (balanced performance)
- complex: z-ai/glm-5 (most capable, handles complex reasoning)

Task: {task}

Provide a brief routing decision explaining why this model is appropriate for this task.

Response format (JSON):
{
  "selected_model": "model_id",
  "reasoning": "Brief explanation",
  "estimated_tokens": number,
  "strategy": "direct|step-by-step|iterative"
}`;

export async function orchestrateRouting(task, complexity, context = '') {
  const startTime = Date.now();
  const cfg = await getConfig();
  
  try {
    const modelMap = cfg.models.agents;
    const selectedModel = modelMap[complexity];
    
    const prompt = ORCHESTRATOR_PROMPT
      .replace('{complexity}', complexity)
      .replace('{task}', task);
    
    const response = await openRouter.messages.create({
      model: ORCHESTRATOR_MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: context ? `${context}\n\n${prompt}` : prompt
      }]
    });

    const responseText = response.content[0].text.trim();
    
    // Try to parse JSON response
    let routingDecision;
    try {
      // Extract JSON from response if wrapped in text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      routingDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        selected_model: selectedModel,
        reasoning: responseText,
        estimated_tokens: cfg.complexity_thresholds[complexity].max_tokens,
        strategy: 'direct'
      };
    } catch {
      routingDecision = {
        selected_model: selectedModel,
        reasoning: responseText,
        estimated_tokens: cfg.complexity_thresholds[complexity].max_tokens,
        strategy: 'direct'
      };
    }

    const time = Date.now() - startTime;
    
    return {
      model: selectedModel,
      orchestrator_model: ORCHESTRATOR_MODEL,
      reasoning: routingDecision.reasoning,
      strategy: routingDecision.strategy || 'direct',
      estimated_tokens: routingDecision.estimated_tokens,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      time
    };
  } catch (error) {
    const time = Date.now() - startTime;
    console.error('Orchestrator error:', error.message);
    
    // Fallback to direct model selection
    const modelMap = cfg.models.agents;
    return {
      model: modelMap[complexity],
      orchestrator_model: ORCHESTRATOR_MODEL,
      reasoning: 'Fallback due to orchestrator error',
      strategy: 'direct',
      error: error.message,
      tokens: { input: 0, output: 0 },
      time,
      fallback: true
    };
  }
}

// CLI usage
if (process.argv[1].includes('orchestrator.mjs')) {
  const task = process.argv[2];
  const complexity = process.argv[3] || 'medium';
  const context = process.argv[4] || '';
  
  if (!task) {
    console.error('Usage: node orchestrator.mjs "task" [complexity] ["context"]');
    process.exit(1);
  }
  
  const result = await orchestrateRouting(task, complexity, context);
  console.log(JSON.stringify(result, null, 2));
}
