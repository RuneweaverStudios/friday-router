#!/usr/bin/env node
/**
 * API Detection - Detect which provider user has configured
 * Priority: ZAI > GOOGLE > ANTHROPIC > OPENROUTER
 */

import { existsSync, readFileSync } from 'fs';

export function detectProvider() {
  // Check environment variables
  if (process.env.ZAI_API_KEY) {
    return {
      provider: 'zai',
      apiKey: process.env.ZAI_API_KEY,
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      models: {
        fast: 'glm-4-flash',
        smart: 'glm-5',
        fallback: 'glm-4-flash'
      }
    };
  }
  
  if (process.env.GOOGLE_API_KEY) {
    return {
      provider: 'google',
      apiKey: process.env.GOOGLE_API_KEY,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      models: {
        fast: 'gemini-2.0-flash-exp',
        smart: 'gemini-exp-1206',
        fallback: 'gemini-2.0-flash-exp'
      }
    };
  }
  
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: 'https://api.anthropic.com/v1',
      models: {
        fast: 'claude-3-5-haiku-20241022',
        smart: 'claude-3-5-sonnet-20241022',
        fallback: 'claude-3-5-haiku-20241022'
      }
    };
  }
  
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      models: {
        fast: 'inception/mercury-2',
        smart: 'zai/glm-5',
        fallback: 'inception/mercury-2'
      }
    };
  }
  
  // No API key found
  return null;
}

export function getProviderInfo(providerName) {
  const info = {
    zai: {
      name: 'Zhipu AI',
      fastModel: 'GLM-4-Flash',
      smartModel: 'GLM-5',
      cost: 'Free tier available'
    },
    google: {
      name: 'Google AI',
      fastModel: 'Gemini 2.0 Flash',
      smartModel: 'Gemini 2.0 Pro',
      cost: 'Pay per use'
    },
    anthropic: {
      name: 'Anthropic',
      fastModel: 'Claude 3.5 Haiku',
      smartModel: 'Claude 3.5 Sonnet',
      cost: 'Pay per use'
    },
    openrouter: {
      name: 'OpenRouter',
      fastModel: 'Mercury-2 (free)',
      smartModel: 'GLM-5',
      cost: 'Aggregated'
    }
  };
  
  return info[providerName] || null;
}

// CLI usage
if (process.argv[1].includes('detect-api.mjs')) {
  const provider = detectProvider();
  
  if (!provider) {
    console.error('❌ No API key found');
    console.error('');
    console.error('Set one of:');
    console.error('  export ZAI_API_KEY="..."');
    console.error('  export GOOGLE_API_KEY="..."');
    console.error('  export ANTHROPIC_API_KEY="..."');
    console.error('  export OPENROUTER_API_KEY="..."');
    process.exit(1);
  }
  
  const info = getProviderInfo(provider.provider);
  
  console.log('✅ Provider detected:', info.name);
  console.log('');
  console.log('Fast model:', info.fastModel);
  console.log('Smart model:', info.smartModel);
  console.log('Cost:', info.cost);
  console.log('');
  console.log('Config:', JSON.stringify(provider, null, 2));
}
