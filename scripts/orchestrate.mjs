#!/usr/bin/env node

/**
 * Parallel Orchestration Module
 * Coordinates simultaneous execution of fast and smart agents
 * Ensures both start immediately and run in parallel
 */

import { streamFastResponse } from './fast-agent.mjs';
import { orchestrateSmartResponse } from './smart-agent.mjs';

/**
 * Execute fast and smart agents in parallel
 * @param {string} prompt - User's prompt
 * @param {Object} options - Orchestration options
 * @returns {Promise<Object>} Combined results from both agents
 */
export async function orchestrateParallel(prompt, options = {}) {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   FRIDAY ROUTER v2.0 - PARALLEL MODE     ║');
  console.log('╚══════════════════════════════════════════╝\n');
  
  console.log(`User Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"\n`);
  console.log('🚀 Launching parallel execution...\n');
  
  // Start both agents simultaneously
  const startTime = Date.now();
  
  const [fastResult, smartResult] = await Promise.all([
    // Fast Agent - streams immediately
    streamFastResponse(prompt, options).catch(error => {
      console.error('[Fast] Error:', error.message);
      return { error: error.message };
    }),
    
    // Smart Agent - orchestrates in parallel
    orchestrateSmartResponse(prompt, options).catch(error => {
      console.error('[Smart] Error:', error.message);
      return { error: error.message };
    })
  ]);
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         EXECUTION COMPLETE               ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`⏱️  Total Duration: ${duration}s`);
  console.log(`📊 Fast Agent: ${fastResult.error ? '❌ Error' : '✅ Complete'}`);
  console.log(`📊 Smart Agent: ${smartResult.error ? '❌ Error' : '✅ Complete'}`);
  
  if (smartResult.subtaskCount) {
    console.log(`📊 Subtasks Executed: ${smartResult.subtaskCount}`);
  }
  
  return {
    prompt,
    duration,
    fast: fastResult,
    smart: smartResult,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format results for display
 * @param {Object} results - Orchestration results
 * @returns {string} Formatted output
 */
export function formatResults(results) {
  let output = '\n=== FINAL RESULTS ===\n\n';
  
  // Fast agent result
  output += '⚡ FAST AGENT (Immediate Response):\n';
  output += `${'-'.repeat(50)}\n`;
  if (results.fast.error) {
    output += `Error: ${results.fast.error}\n`;
  } else {
    output += `${results.fast}\n`;
  }
  
  // Smart agent result
  output += '\n🧠 SMART AGENT (Comprehensive Answer):\n';
  output += `${'-'.repeat(50)}\n`;
  if (results.smart.error) {
    output += `Error: ${results.smart.error}\n`;
  } else {
    output += `Complexity: ${results.smart.analysis?.complexity || 'N/A'}\n`;
    output += `Subtasks: ${results.smart.subtaskCount || 0}\n`;
    output += `\n${results.smart.synthesis || results.smart}\n`;
  }
  
  return output;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv[2];
  
  if (!prompt) {
    console.error('Usage: node orchestrate.mjs "your prompt"');
    process.exit(1);
  }
  
  orchestrateParallel(prompt)
    .then(results => {
      console.log(formatResults(results));
    })
    .catch(error => {
      console.error('Orchestration Error:', error.message);
      process.exit(1);
    });
}
