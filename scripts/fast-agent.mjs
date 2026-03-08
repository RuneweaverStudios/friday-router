#!/usr/bin/env node

/**
 * Fast Agent Module
 * Handles immediate streaming responses from fast models
 * Designed for quick, direct answers that users see first
 */

import { detectAPI } from './detect-api.mjs';
import { getModelConfig } from './models.mjs';

/**
 * Stream response from fast model
 * @param {string} prompt - User's prompt
 * @param {Object} options - Streaming options
 * @returns {Promise<string>} Full response text
 */
export async function streamFastResponse(prompt, options = {}) {
  const api = detectAPI();
  
  if (!api.configured) {
    throw new Error(api.error);
  }
  
  const modelConfig = getModelConfig(api.name, 'fast');
  
  console.log('\n[Fast] Starting immediate response...');
  console.log(`[Fast] Model: ${modelConfig.model}`);
  console.log(`[Fast] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}\n`);
  
  // For now, we'll use a simple streaming approach
  // In production, this would call the actual API with streaming
  
  const response = await callModelStreaming(
    api.name,
    modelConfig.model,
    prompt,
    options
  );
  
  return response;
}

/**
 * Call model with streaming (implementation varies by provider)
 * @param {string} provider - API provider
 * @param {string} model - Model identifier
 * @param {string} prompt - User prompt
 * @param {Object} options - Additional options
 * @returns {Promise<string>} Full response
 */
async function callModelStreaming(provider, model, prompt, options) {
  // This is a placeholder implementation
  // In production, this would make actual API calls
  
  // Simulate streaming delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // For demonstration, we'll return a mock response
  // In production, replace with actual API calls
  
  const responses = {
    zhipu: `Based on your request: "${prompt.substring(0, 50)}..."\n\nHere's a quick answer to get you started...`,
    google: `Quick response: ${prompt.substring(0, 30)}...\n\nImmediate answer incoming...`,
    anthropic: `Fast answer for: "${prompt.substring(0, 40)}..."\n\nLet me provide a quick response...`,
    openrouter: `Rapid response: ${prompt.substring(0, 35)}...\n\nQuick answer below...`
  };
  
  const response = responses[provider] || `Processing: ${prompt.substring(0, 50)}...`;
  
  // Stream the response character by character
  const words = response.split(' ');
  let fullResponse = '';
  
  for (const word of words) {
    process.stdout.write(`[Fast] ${word} `);
    fullResponse += word + ' ';
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  
  console.log('\n');
  return fullResponse.trim();
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv[2];
  
  if (!prompt) {
    console.error('Usage: node fast-agent.mjs "your prompt"');
    process.exit(1);
  }
  
  streamFastResponse(prompt)
    .then(response => {
      console.log('\n[Fast] Complete!');
      console.log('[Fast] Response:', response);
    })
    .catch(error => {
      console.error('[Fast] Error:', error.message);
      process.exit(1);
    });
}
