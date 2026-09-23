// lib/composio/tools.js
// General-purpose Composio helper for LLM tool-calling via the Vercel AI SDK.
//
// This is SEPARATE from lib/social/composio.js: that module executes fixed tool
// slugs for multi-account social posting. THIS module hands an LLM a live set of
// Composio connectors (Gmail, Slack, Notion, GitHub, …) already shaped for the
// Vercel AI SDK's generateText/streamText — so agents/features you build can call
// them. It only imports @composio/core + @composio/vercel (NOT the `ai` package),
// so importing it into a Vercel function stays lightweight; the caller supplies
// the model and runs generateText.
//
// Env:
//   COMPOSIO_API_KEY   (required)  — https://app.composio.dev
//   COMPOSIO_USER_ID   (optional)  — single-tenant user id, default 'merlows'
//
// Setup, once per toolkit you want to use:
//   1. Set COMPOSIO_API_KEY.
//   2. connectToolkit(userId, 'gmail') → send the returned redirectUrl to the
//      user, await waitForConnection() (OAuth). Multiple accounts per toolkit are
//      distinguished by connectedAccountId; a single default connection needs no id.

import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

// One stable Composio userID for this single-tenant app (matches lib/social).
export const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID || 'merlows';

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

let _client = null;

/**
 * Cached Composio client wired to the Vercel AI SDK provider.
 * Throws if COMPOSIO_API_KEY is unset.
 */
export function getComposio() {
  if (_client) return _client;
  if (!process.env.COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY not set');
  _client = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new VercelProvider(),
  });
  return _client;
}

/**
 * Fetch Composio tools shaped for the Vercel AI SDK.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.toolkits]  e.g. ['gmail','slack'] — all tools in each toolkit
 * @param {string[]} [opts.tools]     specific tool slugs, e.g. ['GMAIL_SEND_EMAIL']
 * @param {number}   [opts.limit]     cap the number of tools returned
 * @param {string}   [opts.userId]    Composio user id (default COMPOSIO_USER_ID)
 * @returns {Promise<Record<string, import('ai').Tool>>} tools object for generateText({ tools })
 *
 * Pass either `toolkits` or `tools`. The returned tools carry their own `execute`,
 * so the AI SDK runs them automatically when you set stopWhen: stepCountIs(n).
 */
export async function getTools({ toolkits, tools, limit, userId = COMPOSIO_USER_ID } = {}) {
  const composio = getComposio();
  if (tools && tools.length) {
    // Multiple explicit slugs, or a single slug string.
    return composio.tools.get(userId, tools.length === 1 ? tools[0] : { tools });
  }
  const selector = {};
  if (toolkits && toolkits.length) selector.toolkits = toolkits;
  if (limit) selector.limit = limit;
  return composio.tools.get(userId, selector);
}

/**
 * Find an existing auth config id (ac_…) for a toolkit, or null.
 * @param {string} toolkit  toolkit slug, e.g. 'gmail'
 * @returns {Promise<string|null>}
 */
export async function findAuthConfig(toolkit) {
  const composio = getComposio();
  const resp = await composio.authConfigs.list();
  const items = resp?.items || resp?.data || resp || [];
  const match = items.find(
    (c) => (c.toolkit?.slug || c.toolkitSlug || c.appName || '').toLowerCase() === toolkit.toLowerCase()
  );
  return match ? (match.id || match.nanoid) : null;
}

/**
 * Begin connecting a toolkit for a user via Composio hosted OAuth.
 * Send the user to `redirectUrl`, then await `waitForConnection()`.
 *
 * Current Composio flow (the older toolkits.authorize / connectedAccounts.initiate
 * endpoints are deprecated): reuse-or-create an auth config, then
 * connectedAccounts.link(). For toolkits without Composio-managed OAuth (many social
 * platforms), pass a pre-made `authConfigId` built from your own OAuth app.
 *
 * @param {string} toolkit  toolkit slug, e.g. 'gmail'
 * @param {object} [opts]
 * @param {string}  [opts.userId]        default COMPOSIO_USER_ID
 * @param {string}  [opts.authConfigId]  reuse a specific ac_… (skips lookup/create)
 * @param {boolean} [opts.managed=true]  create a Composio-managed-auth config if none exists
 * @returns {Promise<{ redirectUrl: string, id: string, authConfigId: string, waitForConnection: (ms?: number) => Promise<any> }>}
 */
export async function connectToolkit(toolkit, { userId = COMPOSIO_USER_ID, authConfigId, managed = true } = {}) {
  const composio = getComposio();
  let acId = authConfigId || (await findAuthConfig(toolkit));
  if (!acId) {
    const ac = await composio.authConfigs.create(toolkit, managed ? { type: 'use_composio_managed_auth' } : {});
    acId = ac?.id || ac?.nanoid;
  }
  const conn = await composio.connectedAccounts.link(userId, acId);
  return {
    redirectUrl: conn.redirectUrl || conn.redirect_url,
    id: conn.id || conn.connectedAccountId || conn.connected_account_id,
    authConfigId: acId,
    // Blocks until the OAuth flow completes (default 60s in the SDK).
    waitForConnection: (ms) => conn.waitForConnection(ms),
  };
}

/**
 * List a user's Composio connections, normalised. Optionally ACTIVE-only.
 * @returns {Promise<Array<{ id: string, status: string, toolkit: string }>>}
 */
export async function listConnections({ userId = COMPOSIO_USER_ID, activeOnly = false } = {}) {
  const composio = getComposio();
  const opts = { userIds: [userId] };
  if (activeOnly) opts.statuses = ['ACTIVE'];
  const resp = await composio.connectedAccounts.list(opts);
  const items = resp?.items || resp?.data || resp || [];
  return items.map((a) => ({
    id: a.id || a.connectedAccountId || a.connected_account_id,
    status: a.status,
    toolkit: a.toolkit?.slug || a.toolkitSlug || a.appName,
  }));
}
