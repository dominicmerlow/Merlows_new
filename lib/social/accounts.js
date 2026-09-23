// lib/social/accounts.js
// Multi-account registry for social posting, persisted in KV.
//
// Each account is one connected destination (e.g. "Merlows IG", "Founder IG").
// Composio stores/refreshes the OAuth tokens; we store only the pointer
// (connectedAccountId) plus a label and which account is the platform default.
//
// KV key: social:accounts → Array<Account>
//   Account = {
//     id, platform, label, provider: 'composio',
//     connectedAccountId, isDefault, status, createdAt,
//     config: { authorUrn?, pageId?, igUserId? }  // account-scoped ids some
//       Composio tools require (LinkedIn author URN, Facebook page_id,
//       Instagram ig_user_id) — captured at connect/registration time.
//   }

import { kv } from '../kv.js';

const KEY = 'social:accounts';

export async function listAccounts(platform = null) {
  const all = (await kv.get(KEY)) || [];
  return platform ? all.filter((a) => a.platform === platform) : all;
}

export async function addAccount({ platform, label, connectedAccountId, config = null, provider = 'composio', status = 'ACTIVE' }) {
  const all = (await kv.get(KEY)) || [];
  const id = `acct_${platform}_${Date.now().toString(36)}`;
  const isFirstForPlatform = !all.some((a) => a.platform === platform);
  const account = {
    id, platform, label: label || platform, provider,
    connectedAccountId, status,
    config: config && typeof config === 'object' ? config : {},
    isDefault: isFirstForPlatform, // first account for a platform becomes its default
    createdAt: new Date().toISOString(),
  };
  all.push(account);
  await kv.set(KEY, all);
  return account;
}

/** Update an account's label and/or config (shallow-merged). */
export async function updateAccount(id, { label, config } = {}) {
  const all = (await kv.get(KEY)) || [];
  const target = all.find((a) => a.id === id);
  if (!target) return null;
  if (typeof label === 'string' && label.trim()) target.label = label.trim();
  if (config && typeof config === 'object') {
    target.config = { ...(target.config || {}), ...config };
  }
  await kv.set(KEY, all);
  return target;
}

export async function removeAccount(id) {
  const all = (await kv.get(KEY)) || [];
  const removed = all.find((a) => a.id === id);
  let next = all.filter((a) => a.id !== id);
  // If we removed a platform's default, promote another account of that platform.
  if (removed?.isDefault) {
    const sibling = next.find((a) => a.platform === removed.platform);
    if (sibling) sibling.isDefault = true;
  }
  await kv.set(KEY, next);
  return Boolean(removed);
}

export async function setDefaultAccount(id) {
  const all = (await kv.get(KEY)) || [];
  const target = all.find((a) => a.id === id);
  if (!target) return false;
  for (const a of all) {
    if (a.platform === target.platform) a.isDefault = a.id === id;
  }
  await kv.set(KEY, all);
  return true;
}

/**
 * Resolve which account to post a platform from.
 * @param {string} platform
 * @param {string} [accountId] - explicit account id from the kit (optional)
 * @returns {Promise<Account|null>} null → caller falls back to the legacy env-var adapter
 */
export async function resolveAccount(platform, accountId = null) {
  const accts = await listAccounts(platform);
  if (!accts.length) return null;
  if (accountId) return accts.find((a) => a.id === accountId) || null;
  return accts.find((a) => a.isDefault) || accts[0];
}
