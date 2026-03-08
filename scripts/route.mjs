#!/usr/bin/env node
/**
 * route.mjs — Friday Router: main pipeline entry point
 *
 * Runs the full 3-stage pipeline:
 *   1. Triage     (GLM 4.7 Flash) — fast classification
 *   2. Orchestrate (GLM 5)        — execution planning
 *   3. Dispatch   (GLM 5 agents)  — parallel sub-agent execution + synthesis
 *
 * Usage:
 *   node route.mjs "Build a TikTok content calendar for Polysauce"
 *   node route.mjs "Analyze my top competitors on X" --stream
 *   node route.mjs "Write a Python scraper" --raw
 *   node route.mjs --stdin < task.txt
 *   node route.mjs "Quick task" --skip-triage   (forces medium complexity)
 *   node route.mjs "What is 2+2?" --force-simple (skip to direct GLM 5 answer)
 *   node route.mjs "Explain React hooks" --follow-up
 *
 * Options:
 *   --stream         Stream the final answer token-by-token
 *   --raw            Output structured JSON (for piping)
 *   --stdin          Read task from stdin
 *   --skip-triage    Skip triage, treat as medium complexity
 *   --force-simple   Skip triage + orchestrate, answer directly with GLM 5
 *   --debug          Show all intermediate pipeline outputs
 *   --follow-up      Generate contextual follow-up question after dispatch
 *
 * Environment:
 *   OPENROUTER_API_KEY    Required
 *   TRIAGE_MODEL          GLM 4.7 Flash model (default: z-ai/glm-4.7-flash)
 *   ORCHESTRATOR_MODEL    GLM 5 model (default: z-ai/glm-5)
 *   DISPATCH_MODEL        Sub-agent model (default: z-ai/glm-5)
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const TRIAGE_MODEL = process.env.TRIAGE_MODEL || 'z-ai/glm-4.7-flash';
const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL || 'z-ai/glm-5';
const DISPATCH_MODEL = process.env.DISPATCH_MODEL || 'z-ai/glm-5';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'inception/mercury-2';

// ─── Inline helpers (avoids subprocess overhead) ──────────────────────────────

function getApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error('Error: OPENROUTER_API_KEY is required.');
    console.error('Set it: export OPENROUTER_API_KEY="sk-or-..."');
    process.exit(1);
  }
  return key;
}

async function openRouterCall(model, messages, options = {}) {
  const apiKey = getApiKey();
  const body = {
    model,
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature ?? 0.2,
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    ...(options.stream ? { stream: true } : {}),
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://openclaw.ai',
      'X-Title': options.title || 'Friday Router',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    
    // Rate limit handling - retry with fallback model
    if (response.status === 429 && model !== FALLBACK_MODEL && !options.noFallback) {
      if (options.debug) {
        console.error(`⚠️ Rate limit hit on ${model}, falling back to ${FALLBACK_MODEL}`);
      }
      // Retry with fallback model
      return openRouterCall(FALLBACK_MODEL, messages, { ...options, noFallback: true });
    }
    
    throw new Error(`API error (${response.status}): ${err}`);
  }

  return response;
}

// ─── Stage 1: Triage ──────────────────────────────────────────────────────────

const TRIAGE_SYSTEM = `You are Friday, an AI chief-of-staff. Triage incoming tasks quickly and return only valid JSON.

Output format:
{
  "taskType": "<coding|research|marketing|visual|analysis|writing|automation|general>",
  "complexity": "<simple|medium|complex>",
  "domains": ["<domain1>"],
  "intent": "<one sentence: what the user wants>",
  "estimatedSteps": <1-10>,
  "subAgentsNeeded": <0-4>,
  "reasoning": "<2-3 sentences>"
}

Rules:
- simple (subAgentsNeeded=0): 1-2 steps, direct answer possible
- medium (subAgentsNeeded=1): 2-4 steps, one specialist needed
- complex (subAgentsNeeded=2-4): 4+ steps or multi-domain

Return only JSON, no markdown.`;

async function triage(task, debug) {
  if (debug) console.error('\n[Stage 1: Triage] →', TRIAGE_MODEL);
  const startMs = Date.now();
  const response = await openRouterCall(
    TRIAGE_MODEL,
    [
      { role: 'system', content: TRIAGE_SYSTEM },
      { role: 'user', content: `Triage this task:\n\n${task}` },
    ],
    { maxTokens: 512, temperature: 0.1, json: true, title: 'Friday Triage' }
  );

  const result = await response.json();
  const raw = result.choices?.[0]?.message?.content || '{}';
  const latencyMs = Date.now() - startMs;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Triage returned invalid JSON: ${raw}`);
  }

  if (debug) {
    console.error(`[Triage] ${latencyMs}ms → ${parsed.taskType}/${parsed.complexity} (${parsed.subAgentsNeeded} sub-agents)`);
    console.error(JSON.stringify(parsed, null, 2));
  }

  return { ...parsed, _latencyMs: latencyMs };
}

// ─── Stage 2: Orchestrate ─────────────────────────────────────────────────────

const ORCHESTRATE_SYSTEM = `You are Friday, an AI chief-of-staff. Build a precise execution plan based on the triage result.

Output format (valid JSON only, no markdown):
{
  "mode": "<direct|delegate>",
  "directAnswer": "<string if simple, else null>",
  "plan": {
    "objective": "<success criteria>",
    "subTasks": [
      {
        "id": "task-1",
        "agentType": "<coding|research|marketing|visual|analysis|writing|automation|general>",
        "task": "<precise instruction>",
        "priority": <1-3>,
        "dependsOn": [],
        "context": "<background the agent needs>"
      }
    ],
    "synthesisInstruction": "<how to combine results>"
  }
}

Rules:
- simple/subAgentsNeeded=0 → mode=direct, answer in directAnswer, plan=null
- medium/complex → mode=delegate, directAnswer=null, 1-4 subTasks
- Parallel-safe tasks have empty dependsOn arrays
- Be specific in task instructions — sub-agents only see their task + context`;

async function orchestrate(task, triageResult, debug) {
  if (debug) console.error('\n[Stage 2: Orchestrate] →', ORCHESTRATOR_MODEL);
  const startMs = Date.now();

  const userMsg = `Original task: ${task}

Triage Result:
${JSON.stringify(triageResult, null, 2)}

Build the execution plan.`;

  const response = await openRouterCall(
    ORCHESTRATOR_MODEL,
    [
      { role: 'system', content: ORCHESTRATE_SYSTEM },
      { role: 'user', content: userMsg },
    ],
    { maxTokens: 2048, temperature: 0.2, json: true, title: 'Friday Orchestrate' }
  );

  const result = await response.json();
  const raw = result.choices?.[0]?.message?.content || '{}';
  const latencyMs = Date.now() - startMs;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Orchestrator returned invalid JSON: ${raw}`);
  }

  if (debug) {
    console.error(`[Orchestrate] ${latencyMs}ms → mode=${parsed.mode}, tasks=${parsed.plan?.subTasks?.length || 0}`);
    console.error(JSON.stringify(parsed, null, 2));
  }

  return { ...parsed, _latencyMs: latencyMs };
}

// ─── Stage 3: Dispatch ────────────────────────────────────────────────────────

const AGENT_PERSONAS = {
  coding: 'You are an expert software engineer. Write clean, working code. Be precise. Include setup instructions when needed.',
  research: 'You are an expert researcher. Gather information, identify key insights, synthesize findings. Be factual and actionable.',
  marketing: 'You are a top marketing strategist and copywriter. Create compelling, platform-native content that converts.',
  visual: 'You are a visual design expert. Use ASCII/markdown diagrams. Be precise about layouts and specifications.',
  analysis: 'You are a sharp business analyst. Break down problems systematically, provide data-driven insights and recommendations.',
  writing: 'You are a professional writer and editor. Produce clear, engaging, well-structured content.',
  automation: 'You are an automation engineer. Build reliable scripts and pipelines. Document setup steps clearly.',
  general: 'You are Friday, a versatile AI assistant. Handle the task with precision and creativity.',
};

const SYNTHESIS_SYSTEM = `You are Friday, an AI chief-of-staff synthesizing results from specialized sub-agents. Combine all results into one cohesive, high-quality final output. Do not repeat information. Present it as unified work — professional, clear, complete.`;

function buildWaves(subTasks) {
  const waves = [];
  const completed = new Set();
  const remaining = [...subTasks];

  while (remaining.length > 0) {
    const wave = remaining.filter(t => (t.dependsOn || []).every(d => completed.has(d)));
    if (wave.length === 0) {
      waves.push([...remaining]);
      break;
    }
    waves.push(wave);
    wave.forEach(t => {
      completed.add(t.id);
      remaining.splice(remaining.indexOf(t), 1);
    });
  }
  return waves;
}

async function runSubAgent(subtask, priorContext, debug) {
  const persona = AGENT_PERSONAS[subtask.agentType] || AGENT_PERSONAS.general;
  const contextText = [subtask.context, priorContext].filter(Boolean).join('\n\n');
  const userMsg = contextText ? `Context:\n${contextText}\n\nTask:\n${subtask.task}` : subtask.task;

  if (debug) console.error(`  [${subtask.id}] ${subtask.agentType} agent starting...`);
  const startMs = Date.now();

  const response = await openRouterCall(
    DISPATCH_MODEL,
    [
      { role: 'system', content: persona },
      { role: 'user', content: userMsg },
    ],
    { maxTokens: 4096, temperature: 0.4, title: `Friday ${subtask.agentType}` }
  );

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '';
  const latencyMs = Date.now() - startMs;

  if (debug) console.error(`  [${subtask.id}] Done in ${latencyMs}ms`);
  return { ...subtask, result: content, latencyMs, usage: result.usage || {} };
}

async function dispatch(task, orchestration, stream, raw, debug) {
  // Direct mode: orchestrator already answered
  if (orchestration.mode === 'direct') {
    const answer = orchestration.directAnswer || '';
    if (stream) {
      process.stdout.write(answer);
      console.log('');
    } else if (raw) {
      console.log(JSON.stringify({ mode: 'direct', result: answer }));
    } else {
      console.log('\n' + answer);
    }
    return;
  }

  const plan = orchestration.plan;
  if (!plan?.subTasks?.length) {
    throw new Error('Delegate mode requires plan.subTasks');
  }

  const waves = buildWaves(plan.subTasks);
  if (debug) console.error(`\n[Stage 3: Dispatch] ${plan.subTasks.length} tasks in ${waves.length} wave(s)`);

  const allResults = [];

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (debug) console.error(`\nWave ${i + 1}: ${wave.length} task(s) in parallel`);

    const priorContext = allResults.length > 0
      ? allResults.map(r => `[${r.id}] ${r.agentType}:\n${r.result.slice(0, 600)}`).join('\n\n---\n\n')
      : '';

    const waveResults = await Promise.all(
      wave.map(t => runSubAgent(t, t.dependsOn?.length ? priorContext : '', debug))
    );
    allResults.push(...waveResults);
  }

  // Single task — no synthesis needed
  if (allResults.length === 1) {
    const r = allResults[0];
    if (stream || !raw) {
      console.log('\n' + r.result);
    } else {
      console.log(JSON.stringify({ mode: 'delegate', results: allResults }));
    }
    return;
  }

  // Synthesize
  if (debug) console.error('\n[Synthesis] Combining results...');
  const combinedText = allResults
    .map(r => `## ${r.agentType.toUpperCase()} (${r.id})\n\n${r.result}`)
    .join('\n\n---\n\n');

  const synthesisPrompt = `${plan.synthesisInstruction || 'Combine all results into a final cohesive answer.'}\n\nSub-agent results:\n\n${combinedText}`;

  if (stream) {
    const resp = await openRouterCall(
      DISPATCH_MODEL,
      [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: synthesisPrompt },
      ],
      { maxTokens: 4096, temperature: 0.3, stream: true, title: 'Friday Synthesis' }
    );

    console.log('');
    const reader = resp.body.getReader();
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
          const c = chunk.choices?.[0]?.delta?.content;
          if (c) process.stdout.write(c);
        } catch { /* skip */ }
      }
    }
    console.log('');
  } else {
    const resp = await openRouterCall(
      DISPATCH_MODEL,
      [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: synthesisPrompt },
      ],
      { maxTokens: 4096, temperature: 0.3, title: 'Friday Synthesis' }
    );
    const synthResult = await resp.json();
    const finalAnswer = synthResult.choices?.[0]?.message?.content || '';

    if (raw) {
      console.log(JSON.stringify({
        mode: 'delegate',
        finalAnswer,
        subResults: allResults,
        totalLatencyMs: allResults.reduce((s, r) => s + r.latencyMs, 0),
      }, null, 2));
    } else {
      console.log('\n' + finalAnswer);
      const totalMs = allResults.reduce((s, r) => s + r.latencyMs, 0);
      console.log(`\n[${allResults.length} sub-agent(s) | ${totalMs}ms]`);
    }
  }
}

// ─── Follow-up Question Generator ─────────────────────────────────────────────

const FOLLOWUP_SYSTEM = `You are Friday, an AI assistant. Given a completed task and its context, suggest ONE natural follow-up question the user might want to ask next.

Output format (JSON only):
{
  "followUp": "<one short question, max 15 words>"
}

Rules:
- Make it actionable and specific to the task
- Suggest logical next steps or related topics
- Keep it conversational and natural
- Never repeat the original task`;

async function generateFollowUp(task, triageResult, orchestration, debug) {
  if (debug) console.error('\n[Follow-up] Generating contextual question...');
  const startMs = Date.now();

  const context = `Original task: ${task}
Task type: ${triageResult.taskType}
Complexity: ${triageResult.complexity}
Domains: ${triageResult.domains?.join(', ') || 'general'}
Mode: ${orchestration.mode}`;

  const response = await openRouterCall(
    TRIAGE_MODEL, // Use fast model for follow-up generation
    [
      { role: 'system', content: FOLLOWUP_SYSTEM },
      { role: 'user', content: `Suggest a follow-up question:\n\n${context}` },
    ],
    { maxTokens: 128, temperature: 0.7, json: true, title: 'Friday Follow-up' }
  );

  const result = await response.json();
  const raw = result.choices?.[0]?.message?.content || '{}';
  const latencyMs = Date.now() - startMs;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback follow-up based on task type
    const fallbacks = {
      coding: 'Want me to add tests for this code?',
      research: 'Should I dive deeper into any specific aspect?',
      marketing: 'Want me to create a posting schedule for this?',
      visual: 'Need me to export this in a different format?',
      analysis: 'Want me to visualize this data?',
      writing: 'Should I adjust the tone or length?',
      automation: 'Want me to add error handling?',
      general: 'Is there anything specific you\'d like me to expand on?',
    };
    parsed = { followUp: fallbacks[triageResult.taskType] || fallbacks.general };
  }

  if (debug) console.error(`[Follow-up] ${latencyMs}ms → "${parsed.followUp}"`);
  return parsed.followUp;
}

// ─── Routing Metadata Display ────────────────────────────────────────────────

function displayRoutingDecision(triageResult, skipTriage = false, forceSimple = false) {
  const lines = [];
  lines.push('🔄 Routing Decision:');

  if (forceSimple) {
    lines.push(`  Direct: ${ORCHESTRATOR_MODEL} (force-simple mode)`);
  } else {
    lines.push(`  Triage: ${TRIAGE_MODEL} (complexity: ${triageResult.complexity})`);
    lines.push(`  Orchestrator: ${ORCHESTRATOR_MODEL}`);
    lines.push(`  Sub-agent: ${DISPATCH_MODEL}`);
  }

  lines.push('');
  lines.push(`✅ Task dispatched to ${getDisplayModelName(DISPATCH_MODEL)}`);

  console.error('\n' + lines.join('\n'));
}

function getDisplayModelName(model) {
  const names = {
    'z-ai/glm-4.7-flash': 'GLM 4.7 Flash',
    'z-ai/glm-4.7': 'GLM 4.7',
    'z-ai/glm-5': 'GLM 5',
    'zhipu/glm-4-flash': 'GLM 4 Flash',
    'zhipu/glm-4': 'GLM 4',
  };
  return names[model] || model;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stream') { args.stream = true; continue; }
    if (a === '--raw') { args.raw = true; continue; }
    if (a === '--stdin') { args.stdin = true; continue; }
    if (a === '--debug') { args.debug = true; continue; }
    if (a === '--skip-triage') { args.skipTriage = true; continue; }
    if (a === '--force-simple') { args.forceSimple = true; continue; }
    if (a === '--follow-up') { args.followUp = true; continue; }
    if (!a.startsWith('--') && !args.task) { args.task = a; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  let task = args.task || '';
  if (args.stdin) {
    task = readFileSync('/dev/stdin', 'utf-8').trim();
  }
  if (!task) {
    console.error('Friday Router — Intelligent task routing pipeline');
    console.error('');
    console.error('Usage: node route.mjs "your task" [options]');
    console.error('       node route.mjs --stdin < task.txt');
    console.error('');
    console.error('Options:');
    console.error('  --stream        Stream the final answer');
    console.error('  --raw           Output JSON (for piping)');
    console.error('  --debug         Show pipeline internals');
    console.error('  --skip-triage   Treat as medium complexity');
    console.error('  --force-simple  Answer directly with GLM 5');
    console.error('  --follow-up     Generate follow-up question after response');
    console.error('');
    console.error('Environment: OPENROUTER_API_KEY required');
    process.exit(1);
  }

  const totalStart = Date.now();

  // --force-simple: skip the pipeline, answer directly
  if (args.forceSimple) {
    if (args.debug) console.error('[Force Simple] Skipping triage + orchestration');

    // Display routing decision
    displayRoutingDecision({}, false, true);

    const resp = await openRouterCall(
      ORCHESTRATOR_MODEL,
      [{ role: 'user', content: task }],
      { maxTokens: 4096, temperature: 0.5, stream: args.stream, title: 'Friday Direct' }
    );

    if (args.stream) {
      const reader = resp.body.getReader();
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
            const c = chunk.choices?.[0]?.delta?.content;
            if (c) process.stdout.write(c);
          } catch { /* skip */ }
        }
      }
      console.log('');
    } else {
      const result = await resp.json();
      const content = result.choices?.[0]?.message?.content || '';
      console.log('\n' + content);
    }

    // Generate follow-up if requested
    if (args.followUp) {
      const followUp = await generateFollowUp(
        task,
        { taskType: 'general', complexity: 'simple' },
        { mode: 'direct' },
        args.debug
      );
      console.log('\n💬 ' + followUp);
    }

    return;
  }

  // Stage 1: Triage
  let triageResult;
  if (args.skipTriage) {
    if (args.debug) console.error('[Skip Triage] Using default medium complexity');
    triageResult = {
      taskType: 'general',
      complexity: 'medium',
      domains: ['general'],
      intent: task,
      estimatedSteps: 3,
      subAgentsNeeded: 1,
      reasoning: 'Triage skipped — defaulting to medium complexity.',
    };
  } else {
    triageResult = await triage(task, args.debug);
  }

  // Stage 2: Orchestrate
  const orchestration = await orchestrate(task, triageResult, args.debug);

  // Display routing decision (before dispatch)
  if (!args.raw) {
    displayRoutingDecision(triageResult, args.skipTriage, false);
  }

  // Stage 3: Dispatch
  await dispatch(task, orchestration, args.stream, args.raw, args.debug);

  const totalMs = Date.now() - totalStart;
  if (args.debug) console.error(`\n[Pipeline complete] ${totalMs}ms total`);

  // Generate follow-up if requested
  if (args.followUp && !args.raw) {
    const followUp = await generateFollowUp(task, triageResult, orchestration, args.debug);
    console.log('\n💬 ' + followUp);
  }
}

main().catch(e => { console.error('Friday Router error:', e.message); process.exit(1); });
