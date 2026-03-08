#!/usr/bin/env node
/**
 * Friday Router v2 - Parallel Execution
 * 
 * Architecture:
 *   User Prompt → Fast Agent (streams immediately)
 *              → Smart Agent (orchestrates in background)
 * 
 * Usage:
 *   node friday.mjs "Your task"
 *   node friday.mjs "Explain React hooks" --verbose
 */

import { spawn } from 'child_process';
import { detectProvider } from './detect-api.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const task = args.filter(a => !a.startsWith('-')).join(' ');

if (!task) {
  console.error('Usage: node friday.mjs "Your task" [--verbose]');
  process.exit(1);
}

const provider = detectProvider();

if (!provider) {
  console.error('❌ No API key found. Set ZAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY');
  process.exit(1);
}

console.log(`🔍 Provider: ${provider.provider.toUpperCase()}`);
console.log(`📋 Task: ${task}`);
console.log('');

// ─── FAST AGENT (immediate streaming response) ──────────────────────────────

const fastAgent = spawn('node', ['call-api.mjs', task, 'fast', provider.provider], {
  stdio: ['inherit', 'pipe', 'pipe']
});

let fastResponse = '';

fastAgent.stdout.on('data', (data) => {
  const output = data.toString();
  fastResponse += output;
  
  // Stream to user immediately
  if (!verbose) {
    process.stdout.write(output);
  } else {
    console.log('[FAST]', output.trim());
  }
});

fastAgent.stderr.on('data', (data) => {
  if (verbose) {
    console.error('[FAST ERROR]', data.toString().trim());
  }
});

// ─── SMART AGENT (background orchestration) ─────────────────────────────────

const smartAgent = spawn('node', ['call-api.mjs', task, 'smart', provider.provider], {
  stdio: ['inherit', 'pipe', 'pipe']
});

let smartResponse = '';

smartAgent.stdout.on('data', (data) => {
  const output = data.toString();
  smartResponse += output;
  
  if (verbose) {
    console.log('[SMART]', output.trim());
  }
});

smartAgent.stderr.on('data', (data) => {
  if (verbose) {
    console.error('[SMART ERROR]', data.toString().trim());
  }
});

// ─── WAIT FOR BOTH TO COMPLETE ──────────────────────────────────────────────

let fastDone = false;
let smartDone = false;

fastAgent.on('close', (code) => {
  fastDone = true;
  checkComplete();
});

smartAgent.on('close', (code) => {
  smartDone = true;
  checkComplete();
});

function checkComplete() {
  if (fastDone && smartDone) {
    console.log('');
    console.log('✅ Complete');
    
    if (verbose) {
      console.log('');
      console.log('=== FULL OUTPUT ===');
      console.log('');
      console.log('Fast Response:');
      console.log(fastResponse);
      console.log('');
      console.log('Smart Response:');
      console.log(smartResponse);
    }
    
    process.exit(0);
  }
}

// ─── TIMEOUT (30s default) ───────────────────────────────────────────────────

const TIMEOUT = parseInt(process.env.FRIDAY_TIMEOUT_MS || '30000', 10);

setTimeout(() => {
  console.error('');
  console.error('⏱️ Timeout reached');
  fastAgent.kill();
  smartAgent.kill();
  process.exit(1);
}, TIMEOUT);
