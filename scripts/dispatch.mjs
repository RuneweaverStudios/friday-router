#!/usr/bin/env node
/**
 * dispatch.mjs — Sub-agent dispatcher + result aggregator
 *
 * Stage 3 of the Friday Router pipeline.
 * Takes an orchestration plan and executes sub-tasks using GLM 5 with
 * role-specific system prompts. Respects dependency ordering.
 * Parallel tasks (no dependsOn) run concurrently.
 *
 * Usage:
 *   node dispatch.mjs --plan '{"mode":"delegate","plan":{...}}'
 *   node dispatch.mjs --stdin (reads orchestration JSON from stdin)
 *   node dispatch.mjs --stdin --stream (stream final synthesis)
 *
 * Environment:
 *   OPENROUTER_API_KEY     Required
 *   DISPATCH_MODEL         Override sub-agent model (default: z-ai/glm-5)
 */

import { readFileSync } from 'fs';

const DISPATCH_MODEL = process.env.DISPATCH_MODEL || 'z-ai/glm-5';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Role-specific system prompts for each agent type
const AGENT_PERSONAS = {
  coding: `You are an expert software engineer. Write clean, working code. Be precise and thorough. Include setup instructions if needed. Focus on correctness and simplicity.`,
  research: `You are an expert researcher and analyst. Gather information, identify key insights, and synthesize findings. Be factual, cite sources when possible, and highlight what matters most.`,
  marketing: `You are a top-tier marketing strategist and copywriter. Create compelling, platform-native content that converts. Know your audience, use hooks, drive action.`,
  visual: `You are a visual design expert. Create clear diagrams, specifications, or visual plans. Use ASCII/markdown diagrams when code isn't possible. Be precise about dimensions, colors, layouts.`,
  analysis: `You are a sharp business analyst and strategist. Break down problems systematically. Provide data-driven insights, identify patterns, and give actionable recommendations.`,
  writing: `You are a professional writer and editor. Produce clear, engaging, well-structured content. Match tone to context. Be concise but complete.`,
  automation: `You are an automation engineer. Build reliable scripts, workflows, and pipelines. Prefer simple, maintainable solutions. Document the setup steps clearly.`,
  general: `You are Friday, a versatile AI assistant. Handle the task with care, precision, and creativity. Adapt your approach to what the task actually needs.`,
};

const SYNTHESIS_SYSTEM = `You are Friday, an AI chief-of-staff. You receive the results from multiple specialized sub-agents and synthesize them into a single, cohesive, high-quality final output. Integrate all results seamlessly. Do not repeat the same information multiple times. Present the synthesis as if you produced it yourself — professional, clear, and complete.`;

async function callAgent(agentType, task, context, taskId) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY is required.');
    process.exit(1);
  }

  const systemPrompt = AGENT_PERSONAS[agentType] || AGENT_PERSONAS.general;
  const userPrompt = context
    ? `Context:\n${context}\n\nTask:\n${task}`
    : task;

  process.stderr.write(`  [${taskId}] Starting ${agentType} agent...\n`);
  const startMs = Date.now();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://openclaw.ai',
      'X-Title': `Friday Router Dispatch — ${agentType}`,
    },
    body: JSON.stringify({
      model: DISPATCH_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Agent ${taskId} API error (${response.status}): ${err}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '';
  const latencyMs = Date.now() - startMs;

  process.stderr.write(`  [${taskId}] Done in ${latencyMs}ms\n`);

  return {
    taskId,
    agentType,
    task,
    result: content,
    latencyMs,
    usage: result.usage || {},
  };
}

async function synthesize(subResults, synthesisInstruction, stream) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  const combinedResults = subResults
    .map(r => `## ${r.agentType.toUpperCase()} Agent (${r.taskId})\n\nTask: ${r.task}\n\nResult:\n${r.result}`)
    .join('\n\n---\n\n');

  const userPrompt = `${synthesisInstruction}\n\nSub-agent Results:\n\n${combinedResults}`;

  const body = {
    model: DISPATCH_MODEL,
    messages: [
      { role: 'system', content: SYNTHESIS_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0.3,
  };

  if (stream) {
    body.stream = true;
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openclaw.ai',
        'X-Title': 'Friday Router Synthesis',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Synthesis API error (${response.status}): ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const chunk = JSON.parse(data);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) process.stdout.write(content);
        } catch { /* skip */ }
      }
    }
    console.log('');
    return null;
  } else {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openclaw.ai',
        'X-Title': 'Friday Router Synthesis',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Synthesis API error (${response.status}): ${err}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
  }
}

function buildExecutionWaves(subTasks) {
  // Topological sort: group tasks into waves where each wave can run in parallel
  const waves = [];
  const completed = new Set();
  const remaining = [...subTasks];

  while (remaining.length > 0) {
    const wave = remaining.filter(t => {
      const deps = t.dependsOn || [];
      return deps.every(d => completed.has(d));
    });

    if (wave.length === 0) {
      // Circular dependency or bad plan — run remaining as single wave
      console.error('Warning: dependency cycle detected, running remaining tasks together');
      waves.push([...remaining]);
      break;
    }

    waves.push(wave);
    wave.forEach(t => {
      completed.add(t.id);
      const idx = remaining.indexOf(t);
      if (idx !== -1) remaining.splice(idx, 1);
    });
  }

  return waves;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--stdin') { args.stdin = true; continue; }
    if (argv[i] === '--stream') { args.stream = true; continue; }
    if (argv[i] === '--raw') { args.raw = true; continue; }
    if (argv[i] === '--plan' && argv[i + 1]) { args.plan = argv[++i]; continue; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  let orchestration = null;

  if (args.stdin) {
    const stdin = readFileSync('/dev/stdin', 'utf-8').trim();
    try {
      orchestration = JSON.parse(stdin);
    } catch {
      console.error('Error: stdin must be valid orchestration JSON');
      process.exit(1);
    }
  } else if (args.plan) {
    try {
      orchestration = JSON.parse(args.plan);
    } catch {
      console.error('Error: --plan must be valid JSON');
      process.exit(1);
    }
  }

  if (!orchestration) {
    console.error('Usage: node dispatch.mjs --plan \'{"mode":"delegate","plan":{...}}\'');
    console.error('       node dispatch.mjs --stdin (reads orchestration JSON from stdin)');
    process.exit(1);
  }

  // Handle direct mode (simple tasks answered by orchestrator)
  if (orchestration.mode === 'direct') {
    if (args.stream) {
      process.stdout.write(orchestration.directAnswer || '');
      console.log('');
    } else if (args.raw) {
      console.log(JSON.stringify({ mode: 'direct', result: orchestration.directAnswer }));
    } else {
      console.log('\n--- Friday Direct Answer ---\n');
      console.log(orchestration.directAnswer || '(no answer)');
    }
    return;
  }

  // Delegate mode: run sub-agents
  const plan = orchestration.plan;
  if (!plan || !plan.subTasks || plan.subTasks.length === 0) {
    console.error('Error: delegate mode requires plan.subTasks');
    process.exit(1);
  }

  process.stderr.write(`\nFriday Router — Dispatching ${plan.subTasks.length} sub-agent(s)\n`);
  process.stderr.write(`Objective: ${plan.objective}\n\n`);

  // Sort tasks into execution waves (respecting dependencies)
  const waves = buildExecutionWaves(plan.subTasks);
  process.stderr.write(`Execution waves: ${waves.length} (${waves.map(w => w.length).join('+')}) tasks\n\n`);

  const allResults = [];

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    process.stderr.write(`Wave ${i + 1}: running ${wave.length} task(s) in parallel\n`);

    // Pass prior wave results as context if tasks depend on them
    const priorContext = allResults.length > 0
      ? allResults.map(r => `[${r.taskId}] ${r.agentType}: ${r.result.slice(0, 500)}...`).join('\n\n')
      : '';

    const wavePromises = wave.map(subtask => {
      const contextWithPrior = subtask.dependsOn?.length > 0 && priorContext
        ? `Prior task results:\n${priorContext}\n\n${subtask.context || ''}`
        : subtask.context || '';

      return callAgent(subtask.agentType, subtask.task, contextWithPrior, subtask.id);
    });

    const waveResults = await Promise.all(wavePromises);
    allResults.push(...waveResults);
  }

  // Synthesize results
  if (allResults.length === 1 && !plan.synthesisInstruction) {
    // Single task, no synthesis needed
    const r = allResults[0];
    if (args.stream || args.raw) {
      console.log(args.raw ? JSON.stringify({ mode: 'delegate', results: allResults }) : r.result);
    } else {
      console.log('\n--- Friday Result ---\n');
      console.log(r.result);
    }
    return;
  }

  process.stderr.write('\nSynthesizing results...\n');
  const synthesisInstruction = plan.synthesisInstruction || 'Combine all sub-agent results into a final, cohesive answer.';

  if (args.stream) {
    console.log('\n--- Friday Final Answer ---\n');
    await synthesize(allResults, synthesisInstruction, true);
  } else {
    const finalAnswer = await synthesize(allResults, synthesisInstruction, false);

    if (args.raw) {
      console.log(JSON.stringify({
        mode: 'delegate',
        finalAnswer,
        subResults: allResults,
        totalLatencyMs: allResults.reduce((s, r) => s + r.latencyMs, 0),
      }, null, 2));
    } else {
      console.log('\n--- Friday Final Answer ---\n');
      console.log(finalAnswer);
      console.log(`\n[${allResults.length} sub-agents | ${allResults.reduce((s, r) => s + r.latencyMs, 0)}ms total]`);
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
