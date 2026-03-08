#!/usr/bin/env node
/**
 * API Caller - Make requests to detected provider
 * 
 * Usage:
 *   node call-api.mjs "task" "fast|smart" "provider"
 */

import { detectProvider, getProviderInfo } from './detect-api.mjs';

const [task, mode = 'fast', providerOverride] = process.argv.slice(2);

if (!task) {
  console.error('Usage: node call-api.mjs "task" "fast|smart" "provider"');
  process.exit(1);
}

const provider = providerOverride ? {
  provider: providerOverride,
  apiKey: process.env[`${providerOverride.toUpperCase()}_API_KEY`]
} : detectProvider();

if (!provider) {
  console.error('❌ No provider detected');
  process.exit(1);
}

const model = mode === 'fast' 
  ? provider.models.fast 
  : provider.models.smart;

// ─── SYSTEM PROMPTS ────────────────────────────────────────────────────────

const FAST_SYSTEM = `You are Friday Fast, a quick-response AI assistant. Provide immediate, concise answers. Be helpful but brief. Stream your response.`;

const SMART_SYSTEM = `You are Friday Smart, an orchestration AI. Analyze the task, break it into subtasks if needed, and provide comprehensive answers. Think deeply. You can spawn subtasks by outputting JSON:

{
  "analysis": "What the task requires",
  "subtasks": [
    {"task": "Research X", "agent": "fast"},
    {"task": "Analyze Y", "agent": "fast"}
  ],
  "answer": "Your comprehensive answer"
}

If no subtasks needed, just answer directly.`;

// ─── API CALLS ──────────────────────────────────────────────────────────────

async function callZAI(task, model, systemPrompt) {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`ZAI API error: ${response.status}`);
  }

  // Stream response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            process.stdout.write(content);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

async function callOpenRouter(task, model, systemPrompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://openclaw.ai',
      'X-Title': 'Friday Router'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            process.stdout.write(content);
          }
        } catch (e) {
          // Skip
        }
      }
    }
  }
}

async function callGoogle(task, model, systemPrompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${provider.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\nUser: ${task}` }]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Google error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    
    try {
      const json = JSON.parse(chunk);
      if (json.candidates?.[0]?.content?.parts) {
        for (const part of json.candidates[0].content.parts) {
          if (part.text) {
            process.stdout.write(part.text);
          }
        }
      }
    } catch (e) {
      // Skip
    }
  }
}

async function callAnthropic(task, model, systemPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: task }],
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();

        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta') {
            const content = json.delta?.text;
            if (content) {
              process.stdout.write(content);
            }
          }
        } catch (e) {
          // Skip
        }
      }
    }
  }
}

// ─── ROUTE TO PROVIDER ──────────────────────────────────────────────────────

const systemPrompt = mode === 'fast' ? FAST_SYSTEM : SMART_SYSTEM;

try {
  switch (provider.provider) {
    case 'zai':
      await callZAI(task, model, systemPrompt);
      break;
    case 'openrouter':
      await callOpenRouter(task, model, systemPrompt);
      break;
    case 'google':
      await callGoogle(task, model, systemPrompt);
      break;
    case 'anthropic':
      await callAnthropic(task, model, systemPrompt);
      break;
    default:
      console.error('Unknown provider:', provider.provider);
      process.exit(1);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
