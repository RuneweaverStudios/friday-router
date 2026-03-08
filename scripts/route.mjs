#!/usr/bin/env node
/**
 * Friday Router v2.0 - Main Entry Point
 * 
 * Parallel execution: Fast agent streams immediately, Smart agent orchestrates in background
 * 
 * Usage:
 *   node route.mjs "Your task"
 *   node route.mjs "Explain React hooks" --verbose
 *   node route.mjs "Build an API" --json
 */

import { exec } from 'child_process';
import { detectProvider, getProviderInfo } from './detect-api.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const jsonOutput = args.includes('--json');
const task = args.filter(a => !a.startsWith('-')).join(' ');

if (!task) {
  console.log(`
Friday Router v2.0 - Parallel Execution

Usage:
  node route.mjs "Your task"
  node route.mjs "Explain X" --verbose
  node route.mjs "Build Y" --json

Options:
  --verbose, -v    Show detailed progress
  --json          Output as JSON

Architecture:
  User Prompt → Fast Agent (immediate stream)
             → Smart Agent (background orchestration)
  
  The fast agent responds immediately while the smart agent
  thinks deeply and orchestrates subtasks if needed.
`);
  process.exit(0);
}

// Detect provider
const provider = detectProvider();

if (!provider) {
  console.error('❌ No API key found');
  console.error('');
  console.error('Set one of these environment variables:');
  console.error('  export ZAI_API_KEY="..."        # Recommended (cheapest)');
  console.error('  export GOOGLE_API_KEY="..."');
  console.error('  export ANTHROPIC_API_KEY="..."');
  console.error('  export OPENROUTER_API_KEY="..."');
  process.exit(1);
}

const info = getProviderInfo(provider.provider);

if (verbose) {
  console.log('✅ Provider:', info.name);
  console.log('🚀 Fast model:', info.fastModel);
  console.log('🧠 Smart model:', info.smartModel);
  console.log('');
  console.log('📋 Task:', task);
  console.log('');
}

// ─── PARALLEL EXECUTION ─────────────────────────────────────────────────────

import { spawn } from 'child_process';

const startTime = Date.now();

// Spawn both agents simultaneously
const fastAgent = spawn('node', ['call-api.mjs', task, 'fast', provider.provider], {
  cwd: new URL('.', import.meta.url).pathname,
  stdio: ['inherit', 'pipe', 'pipe']
});

const smartAgent = spawn('node', ['call-api.mjs', task, 'smart', provider.provider], {
  cwd: new URL('.', import.meta.url).pathname,
  stdio: ['inherit', 'pipe', 'pipe']
});

let fastOutput = '';
let smartOutput = '';

// Fast agent - stream immediately
if (!jsonOutput) {
  if (verbose) process.stdout.write('⚡ Fast: ');
  fastAgent.stdout.on('data', (data) => {
    const text = data.toString();
    fastOutput += text;
    process.stdout.write(text);
  });
}

fastAgent.stderr.on('data', (data) => {
  if (verbose) process.stderr.write(`[Fast Error] ${data}`);
});

// Smart agent - collect for later
smartAgent.stdout.on('data', (data) => {
  smartOutput += data.toString();
});

smartAgent.stderr.on('data', (data) => {
  if (verbose) process.stderr.write(`[Smart Error] ${data}`);
});

// Wait for both
let fastDone = false;
let smartDone = false;

fastAgent.on('close', (code) => {
  fastDone = true;
  if (verbose && !jsonOutput) console.log('\n✅ Fast complete');
  checkComplete();
});

smartAgent.on('close', (code) => {
  smartDone = true;
  if (verbose) console.log('✅ Smart complete');
  checkComplete();
});

function checkComplete() {
  if (fastDone && smartDone) {
    const elapsed = Date.now() - startTime;
    
    if (jsonOutput) {
      console.log(JSON.stringify({
        task,
        provider: provider.provider,
        fastOutput,
        smartOutput,
        elapsed_ms: elapsed
      }, null, 2));
    } else {
      if (verbose) {
        console.log('\n--- Smart Agent Analysis ---');
        console.log(smartOutput);
      }
      
      console.log(`\n⏱️  Total time: ${(elapsed / 1000).toFixed(1)}s`);
    }
    
    process.exit(0);
  }
}

// Timeout
const TIMEOUT = parseInt(process.env.FRIDAY_TIMEOUT_MS || '60000', 10);
setTimeout(() => {
  console.error('\n⏱️  Timeout reached');
  fastAgent.kill();
  smartAgent.kill();
  process.exit(1);
}, TIMEOUT);
