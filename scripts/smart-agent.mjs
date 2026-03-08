#!/usr/bin/env node

/**
 * Smart Agent Module
 * Handles orchestration, task analysis, and spawning subtasks
 * Analyzes complexity and delegates to fast agents when needed
 */

import { detectAPI } from './detect-api.mjs';
import { getModelConfig } from './models.mjs';
import { streamFastResponse } from './fast-agent.mjs';

/**
 * Analyze task complexity
 * @param {string} prompt - User's prompt
 * @returns {Object} Complexity analysis
 */
function analyzeComplexity(prompt) {
  const words = prompt.split(/\s+/);
  const wordCount = words.length;
  
  // Check for complexity indicators
  const hasMultipleSteps = /and|then|also|additionally|furthermore/i.test(prompt);
  const hasComplexKeywords = /create|build|design|implement|architect|refactor|analyze|compare/i.test(prompt);
  const hasQuestions = (prompt.match(/\?/g) || []).length > 1;
  
  let complexity = 'simple';
  let subtaskCount = 0;
  
  if (hasComplexKeywords || wordCount > 50 || hasQuestions) {
    complexity = 'medium';
    subtaskCount = 2;
  }
  
  if (hasMultipleSteps && hasComplexKeywords) {
    complexity = 'complex';
    subtaskCount = 3;
  }
  
  if (wordCount > 100 && hasMultipleSteps && hasComplexKeywords) {
    complexity = 'very_complex';
    subtaskCount = 4;
  }
  
  return {
    complexity,
    wordCount,
    hasMultipleSteps,
    hasComplexKeywords,
    hasQuestions,
    subtaskCount
  };
}

/**
 * Generate subtasks from a complex prompt
 * @param {string} prompt - User's prompt
 * @param {Object} analysis - Complexity analysis
 * @returns {Array} List of subtask prompts
 */
function generateSubtasks(prompt, analysis) {
  if (analysis.subtaskCount === 0) {
    return [];
  }
  
  // Simple subtask generation (in production, use actual AI)
  const subtasks = [];
  
  if (analysis.hasQuestions) {
    subtasks.push(`Answer the first question in: ${prompt}`);
    subtasks.push(`Address remaining questions in: ${prompt}`);
  }
  
  if (analysis.hasComplexKeywords) {
    subtasks.push(`Analyze requirements for: ${prompt}`);
    subtasks.push(`Generate solution approach for: ${prompt}`);
  }
  
  if (analysis.hasMultipleSteps) {
    subtasks.push(`Break down steps for: ${prompt}`);
  }
  
  return subtasks.slice(0, analysis.subtaskCount);
}

/**
 * Orchestrate smart agent response
 * @param {string} prompt - User's prompt
 * @param {Object} options - Orchestration options
 * @returns {Promise<Object>} Orchestration result
 */
export async function orchestrateSmartResponse(prompt, options = {}) {
  const api = detectAPI();
  
  if (!api.configured) {
    throw new Error(api.error);
  }
  
  const modelConfig = getModelConfig(api.name, 'smart');
  
  console.log('\n[Smart] Starting orchestration...');
  console.log(`[Smart] Model: ${modelConfig.model}`);
  
  // Step 1: Analyze task complexity
  const analysis = analyzeComplexity(prompt);
  console.log(`[Smart] Complexity: ${analysis.complexity} (${analysis.wordCount} words)`);
  console.log(`[Smart] Subtasks needed: ${analysis.subtaskCount}`);
  
  // Step 2: Generate subtasks if needed
  const subtasks = generateSubtasks(prompt, analysis);
  
  // Step 3: Execute subtasks in parallel using fast agents
  const subtaskResults = [];
  
  if (subtasks.length > 0) {
    console.log(`[Smart] Spawning ${subtasks.length} fast agents in parallel...`);
    
    const subtaskPromises = subtasks.map(async (subtask, index) => {
      console.log(`[Smart] Fast Agent #${index + 1}: ${subtask.substring(0, 50)}...`);
      const result = await streamFastResponse(subtask, { prefix: `[Fast#${index + 1}]` });
      return { index: index + 1, subtask, result };
    });
    
    const results = await Promise.all(subtaskPromises);
    subtaskResults.push(...results);
  }
  
  // Step 4: Synthesize comprehensive answer
  console.log('[Smart] Synthesizing comprehensive answer...');
  
  const synthesis = await synthesizeResponse(prompt, subtaskResults, analysis);
  
  console.log('[Smart] Orchestration complete!\n');
  
  return {
    analysis,
    subtaskCount: subtasks.length,
    subtaskResults,
    synthesis
  };
}

/**
 * Synthesize final response from subtask results
 * @param {string} prompt - Original prompt
 * @param {Array} subtaskResults - Results from subtasks
 * @param {Object} analysis - Complexity analysis
 * @returns {Promise<string>} Synthesized response
 */
async function synthesizeResponse(prompt, subtaskResults, analysis) {
  // In production, this would call the smart model API
  // For now, we'll create a structured response
  
  let response = `[Smart] Comprehensive Answer:\n\n`;
  response += `Based on your request: "${prompt.substring(0, 100)}..."\n\n`;
  
  if (subtaskResults.length > 0) {
    response += `I analyzed this as a ${analysis.complexity} task and delegated to ${subtaskResults.length} fast agents:\n\n`;
    
    for (const result of subtaskResults) {
      response += `${result.index}. ${result.subtask.substring(0, 60)}...\n`;
      response += `   Result: ${result.result.substring(0, 100)}...\n\n`;
    }
    
    response += `Synthesis: Combining these insights, the comprehensive answer is...\n`;
  } else {
    response += `This was a ${analysis.complexity} task that I handled directly.\n`;
    response += `Answer: [Direct comprehensive response would go here]\n`;
  }
  
  return response;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv[2];
  
  if (!prompt) {
    console.error('Usage: node smart-agent.mjs "your prompt"');
    process.exit(1);
  }
  
  orchestrateSmartResponse(prompt)
    .then(result => {
      console.log('\n=== Final Result ===');
      console.log('Analysis:', result.analysis);
      console.log('Subtasks:', result.subtaskCount);
      console.log('Synthesis:', result.synthesis);
    })
    .catch(error => {
      console.error('[Smart] Error:', error.message);
      process.exit(1);
    });
}
