#!/usr/bin/env node

/**
 * Model Configurations per Provider
 * Defines the fast and smart model pairs for each supported API provider
 */

export const MODEL_CONFIGS = {
  zhipu: {
    name: 'Zhipu AI',
    fast: {
      model: 'zhipu/glm-4-flash',
      description: 'Free tier, ultra-fast responses',
      maxTokens: 2048,
      temperature: 0.7,
      streaming: true
    },
    smart: {
      model: 'zai/glm-5',
      description: 'Advanced reasoning and orchestration',
      maxTokens: 4096,
      temperature: 0.9,
      streaming: true
    }
  },
  
  google: {
    name: 'Google AI',
    fast: {
      model: 'gemini-2.0-flash-exp',
      description: 'Experimental Gemini Flash',
      maxTokens: 2048,
      temperature: 0.7,
      streaming: true
    },
    smart: {
      model: 'gemini-exp-1206',
      description: 'Advanced Gemini experimental',
      maxTokens: 4096,
      temperature: 0.9,
      streaming: true
    }
  },
  
  anthropic: {
    name: 'Anthropic',
    fast: {
      model: 'claude-3-5-haiku-20241022',
      description: 'Fast and efficient Claude',
      maxTokens: 2048,
      temperature: 0.7,
      streaming: true
    },
    smart: {
      model: 'claude-3-5-sonnet-20241022',
      description: 'Powerful Claude Sonnet',
      maxTokens: 4096,
      temperature: 0.9,
      streaming: true
    }
  },
  
  openrouter: {
    name: 'OpenRouter',
    fast: {
      model: 'inception/mercury-2',
      description: 'Free tier via OpenRouter',
      maxTokens: 2048,
      temperature: 0.7,
      streaming: true
    },
    smart: {
      model: 'zai/glm-5',
      description: 'Advanced via OpenRouter',
      maxTokens: 4096,
      temperature: 0.9,
      streaming: true
    }
  }
};

/**
 * Get model configuration for a provider
 * @param {string} provider - Provider name (zhipu, google, anthropic, openrouter)
 * @param {string} type - Model type (fast or smart)
 * @returns {Object} Model configuration
 */
export function getModelConfig(provider, type = 'fast') {
  const config = MODEL_CONFIGS[provider];
  
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  return config[type];
}

/**
 * Get all available providers
 * @returns {Array} List of provider names
 */
export function getProviders() {
  return Object.keys(MODEL_CONFIGS);
}
