#!/usr/bin/env node
/**
 * orchestrate.mjs — GLM 5 execution planner
 *
 * Stage 2 of the Friday Router pipeline.
 * Takes triage output and builds a detailed execution plan with sub-agent assignments.
 *
 * For simple tasks: answers directly.
 * For medium/complex tasks: creates a structured plan with parallel sub-agent work.
 *
 * Output JSON:
 *   {
 *     mode: "direct" | "delegate",
 *     directAnswer: string | null,   // populated if mode = "direct"
 *     plan: {
 *       objective: string,
 *       subTasks: [
 *         {
 *           id: string,
 *           agentType: "coding" | "research" | "marketing" | "visual" | "analysis" | "writing" | "automation",
 *           task: string,
 *           priority: number,
 *           dependsOn: string[],
 *           context: string
 *         }
 *       ],
 *       synthesisInstruction: string
 *     } | null
 *   }
 *
 * Usage:
 *   node orchestrate.mjs --task "Build TikTok calendar" --triage '{"taskType":"marketing",...}'
 *   node orchestrate.mjs --stdin (reads triage JSON from stdin)
 *
 * Environment:
 *   OPENROUTER_API_KEY     Required
 *   ORCHESTRATOR_MODEL     Override model (default: z-ai/glm-5)
 */

import { readFileSync } from 'fs';

const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL || 'z-ai/glm-5';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are Friday, an AI chief-of-staff and orchestrator. You receive a triaged task description and create a precise execution plan.

Your output must be valid JSON in exactly this format:

{
  "mode": "<direct|delegate>",
  "directAnswer": "<string or null>",
  "plan": {
    "objective": "<clear statement of what success looks like>",
    "subTasks": [
      {
        "id": "<unique short id like 'task-1'>",
        "agentType": "<coding|research|marketing|visual|analysis|writing|automation>",
        "task": "<precise instruction for the sub-agent>",
        "priority": <1-3, lower = run first>,
        "dependsOn": ["<task-id>"],
        "context": "<background context the agent needs>"
      }
    ],
    "synthesisInstruction": "<how to combine sub-agent results into a final answer>"
  }
}

Rules:
- If complexity = "simple" or subAgentsNeeded = 0: set mode = "direct", answer in directAnswer, set plan = null
- If complexity = "medium" or "complex": set mode = "delegate", set directAnswer = null
- For delegate mode: create 1-4 focused sub-tasks, keep each task atomic and self-contained
- Sub-tasks with no dependsOn can run in parallel
- Sub-tasks with dependsOn must run after their dependencies complete
- agentType must match what the task requires (coding agent for code, research agent for lookups, etc.)
- Be specific in task instructions — the sub-agent sees only that task string + context
- Always return valid JSON. No markdown fences.`;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--stdin') { args.stdin = true; continue; }
    if (argv[i] === '--raw') { args.raw = true; continue; }
    if (argv[i] === '--task' && argv[i + 1]) { args.task = argv[++i]; continue; }
    if (argv[i] === '--triage' && argv[i + 1]) { args.triage = argv[++i]; continue; }
  }
  return args;
}

async function callOpenRouter(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY is required.');
    process.exit(1);
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://openclaw.ai',
      'X-Title': 'Friday Router Orchestrator',
    },
    body: JSON.stringify({
      model: ORCHESTRATOR_MODEL,
      messages,
      max_tokens: 2048,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`API error (${response.status}): ${err}`);
    process.exit(1);
  }

  const result = await response.json();
  return {
    content: result.choices?.[0]?.message?.content || '{}',
    usage: result.usage || {},
  };
}

async function main() {
  const args = parseArgs(process.argv);

  let triageData = null;
  let task = args.task || '';

  if (args.stdin) {
    const stdin = readFileSync('/dev/stdin', 'utf-8').trim();
    try {
      triageData = JSON.parse(stdin);
      task = task || triageData._originalTask || triageData.intent || '';
    } catch {
      task = stdin;
    }
  } else if (args.triage) {
    try {
      triageData = JSON.parse(args.triage);
    } catch {
      console.error('Error: --triage must be valid JSON');
      process.exit(1);
    }
  }

  if (!task && !triageData) {
    console.error('Usage: node orchestrate.mjs --task "description" --triage \'{"taskType":"coding",...}\'');
    console.error('       node orchestrate.mjs --stdin (reads triage JSON from stdin)');
    process.exit(1);
  }

  const triageSummary = triageData
    ? `Triage Result:\n${JSON.stringify(triageData, null, 2)}`
    : 'No triage data available.';

  const userMessage = `Original task: ${task || triageData?.intent || 'unknown'}

${triageSummary}

Build the execution plan.`;

  const startMs = Date.now();
  const { content, usage } = await callOpenRouter([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);
  const latencyMs = Date.now() - startMs;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('Orchestrator returned invalid JSON:', content);
    process.exit(1);
  }

  if (args.raw) {
    console.log(JSON.stringify(parsed));
    return;
  }

  const output = {
    ...parsed,
    _meta: {
      model: ORCHESTRATOR_MODEL,
      latencyMs,
      usage,
      stage: 'orchestrate',
      triage: triageData || null,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
