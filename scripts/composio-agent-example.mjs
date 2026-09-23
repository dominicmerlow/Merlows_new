// scripts/composio-agent-example.mjs
// End-to-end demo of driving Composio connectors with an LLM via the Vercel AI SDK.
// Runs LOCALLY (not a Vercel function). Reads the same env vars as production.
//
// Requires in env:
//   COMPOSIO_API_KEY     — https://app.composio.dev  (⚠ a dead key returns 401)
//   OPENROUTER_API_KEY   — your OpenRouter key (this repo already uses OpenRouter)
// Optional:
//   COMPOSIO_USER_ID     — default 'merlows'
//   COMPOSIO_AGENT_MODEL — OpenRouter slug, default 'openai/gpt-4o-mini'
//                          (must be a TOOL-CALLING-capable model)
//
// Usage:
//   node scripts/composio-agent-example.mjs list
//   node scripts/composio-agent-example.mjs connect gmail
//   node scripts/composio-agent-example.mjs run "Summarise my 3 latest emails" gmail
//
// On Windows PowerShell, set env inline like:
//   $env:COMPOSIO_API_KEY='...'; $env:OPENROUTER_API_KEY='...'; node scripts/composio-agent-example.mjs list

import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  isComposioConfigured,
  getTools,
  connectToolkit,
  listConnections,
  COMPOSIO_USER_ID,
} from '../lib/composio/tools.js';

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`Missing ${name} in env. See the header of this file.`);
    process.exit(1);
  }
}

// OpenRouter is OpenAI-compatible, so the @ai-sdk/openai provider works against it.
function model() {
  requireEnv('OPENROUTER_API_KEY');
  const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: { 'HTTP-Referer': 'https://merlows.vercel.app', 'X-Title': 'Merlows Composio Agent' },
  });
  return openrouter(process.env.COMPOSIO_AGENT_MODEL || 'openai/gpt-4o-mini');
}

async function cmdList() {
  const conns = await listConnections({ userId: COMPOSIO_USER_ID });
  if (!conns.length) {
    console.log(`No connections for user "${COMPOSIO_USER_ID}". Connect one with:  node scripts/composio-agent-example.mjs connect <toolkit>`);
    return;
  }
  console.log(`Connections for "${COMPOSIO_USER_ID}":`);
  for (const c of conns) console.log(`  ${c.toolkit.padEnd(16)} ${c.status.padEnd(10)} ${c.id}`);
}

async function cmdConnect(toolkit) {
  if (!toolkit) { console.error('Usage: connect <toolkit>  (e.g. gmail)'); process.exit(1); }
  const { redirectUrl, id, waitForConnection } = await connectToolkit(toolkit, { userId: COMPOSIO_USER_ID });
  console.log(`\n1. Open this URL and grant access:\n\n   ${redirectUrl}\n`);
  console.log(`2. Waiting for the connection (${id}) to become ACTIVE …`);
  const conn = await waitForConnection(180000); // 3 min
  console.log(`\n✅ Connected. status=${conn?.status ?? 'ACTIVE'}`);
}

async function cmdRun(prompt, toolkit) {
  if (!prompt) { console.error('Usage: run "<prompt>" [toolkit=gmail]'); process.exit(1); }
  const toolkits = [toolkit || 'gmail'];
  const tools = await getTools({ toolkits, limit: 20, userId: COMPOSIO_USER_ID });
  console.log(`Loaded ${Object.keys(tools).length} tool(s) from [${toolkits.join(', ')}].`);

  const result = await generateText({
    model: model(),
    prompt,
    tools,
    stopWhen: stepCountIs(5), // allow the model to call tools and reason over results
  });

  console.log('\n--- steps ---');
  result.steps.forEach((s, i) => {
    const calls = (s.toolCalls || []).map((t) => t.toolName).join(', ');
    if (calls) console.log(`  step ${i + 1}: called ${calls}`);
  });
  console.log('\n--- answer ---\n' + result.text);
}

async function main() {
  if (!isComposioConfigured()) requireEnv('COMPOSIO_API_KEY');
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'list':    return cmdList();
    case 'connect': return cmdConnect(rest[0]);
    case 'run':     return cmdRun(rest[0], rest[1]);
    default:
      console.log('Commands:\n  list\n  connect <toolkit>\n  run "<prompt>" [toolkit=gmail]');
  }
}

main().catch((err) => { console.error('\n❌', err?.message || err); process.exit(1); });
