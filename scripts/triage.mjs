#!/usr/bin/env node

/**
 * Triage Module - GLM 4.7 Flash
 * Fast classification of task complexity
 */

import Anthropic from '@anthropic-ai/sdk';

const openRouter = new Anthropic({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const TRIAGE_MODEL = 'z-ai/glm-4.7-flash';

const TRIAGE_PROMPT = `You are a task complexity classifier. Analyze the task and classify it as simple, medium, or complex.

Classification criteria:
- SIMPLE: Definitions, basic questions, single-step operations, quick lookups (max 500 tokens)
- MEDIUM: Explanations, comparisons, summaries, multi-step analysis (max 2000 tokens)
- COMPLEX: Architecture, implementation, design, deep analysis, multi-component systems (max 4000 tokens)

Respond with ONLY one word: simple, medium, or complex

Task: `;

export async function triageTask(task, context = '') {
  const startTime = Date.now();
  
  try {
    const fullTask = context ? `${context}\n\nTask: ${task}` : task;
    
    const response = await openRouter.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: TRIAGE_PROMPT + fullTask
      }]
    });

    const classification = response.content[0].text.trim().toLowerCase();
    const time = Date.now() - startTime;
    
    // Validate classification
    const validClasses = ['simple', 'medium', 'complex'];
    const complexity = validClasses.includes(classification) ? classification : 'medium';
    
    return {
      complexity,
      model: TRIAGE_MODEL,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      time
    };
  } catch (error) {
    const time = Date.now() - startTime;
    console.error('Triage error:', error.message);
    
    // Fallback to medium complexity
    return {
      complexity: 'medium',
      model: TRIAGE_MODEL,
      error: error.message,
      tokens: { input: 0, output: 0 },
      time,
      fallback: true
    };
  }
}

// CLI usage
if (process.argv[1].includes('triage.mjs')) {
  const task = process.argv[2];
  const context = process.argv[3] || '';
  
  if (!task) {
    console.error('Usage: node triage.mjs "task description" ["context"]');
    process.exit(1);
  }
  
  const result = await triageTask(task, context);
  console.log(JSON.stringify(result, null, 2));
}
