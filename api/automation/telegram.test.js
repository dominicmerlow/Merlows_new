import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, isAllowedReviewer } from '../../lib/automation/handlers/telegram.js';

test('Telegram webhook handler', async (t) => {
  // Set environment variables
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  // The publish call after an approval is server-to-server and carries the
  // internal CRON_SECRET bearer (lib/cron-auth.js internalAuthHeaders).
  process.env.CRON_SECRET = 'test-cron-secret';

  await t.test('returns 405 for non-POST requests', async () => {
    let fetchCalls = [];
    const kvMock = {};
    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = { method: 'GET', headers: {} };
    const res = {
      status: (code) => ({
        json: (data) => {
          assert.equal(code, 405);
          assert.deepEqual(data, { error: 'Method not allowed' });
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);
  });

  await t.test('returns 401 for wrong secret', async () => {
    let fetchCalls = [];
    const kvMock = {};
    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      body: { callback_query: { data: 'approve:job_1', id: 'cq_1' } },
    };

    const res = {
      status: (code) => ({
        json: (data) => {
          assert.equal(code, 401);
          assert.deepEqual(data, { error: 'Unauthorized' });
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);
  });

  await t.test('returns 200 for non-button updates (no callback_query)', async () => {
    let fetchCalls = [];
    const kvMock = {};
    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: { message: { text: 'hello' } }, // No callback_query
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          assert.equal(code, 200);
          responseData = data;
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);
    assert.deepEqual(responseData, { ok: true });
  });

  await t.test('approves job and updates status', async () => {
    let fetchCalls = [];

    // Pre-populate KV with a job
    const jobId = 'job_test_1';
    let job = {
      id: jobId,
      ruleId: 'rule_1',
      contentId: 'content_1',
      status: 'pending',
      createdAt: '2026-03-20T10:00:00Z',
    };

    // Simulate KV store
    const kvMock = {
      get: async (key) => {
        if (key === `automation:job:${jobId}`) return job;
        if (key === 'automation:rule:rule_1') {
          return { id: 'rule_1', publish: { wordpress: true } };
        }
        return null;
      },
      set: async (key, value) => {
        if (key === `automation:job:${jobId}`) {
          job = value;
        }
      },
    };

    // Mock fetch for Telegram and publish
    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: { callback_query: { data: 'approve:job_test_1', id: 'cq_1' } },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          assert.equal(code, 200);
          responseData = data;
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);

    assert.deepEqual(responseData, { ok: true });
    assert.equal(job.status, 'published'); // Should be published after /api/publish call
    assert.equal(job.approvedBy, 'telegram');
    assert.ok(job.approvedAt);

    // Verify Telegram API was called
    const telegramCall = fetchCalls.find((c) => c.url.includes('answerCallbackQuery'));
    assert.ok(telegramCall, 'answerCallbackQuery should be called');

    // Verify publish API was called
    const publishCall = fetchCalls.find((c) => c.url.includes('/api/publish'));
    assert.ok(publishCall, 'publish API should be called');
    assert.deepEqual(JSON.parse(publishCall.opts.body), { contentId: 'content_1' });
    // /api/publish is gated to admin|content or the internal bearer.
    assert.equal(publishCall.opts.headers.Authorization, 'Bearer test-cron-secret');
  });

  await t.test('rejects job and updates status', async () => {
    let fetchCalls = [];

    const jobId = 'job_test_2';
    let job = {
      id: jobId,
      ruleId: 'rule_2',
      contentId: 'content_2',
      status: 'pending',
      createdAt: '2026-03-20T10:00:00Z',
    };

    const kvMock = {
      get: async (key) => {
        if (key === `automation:job:${jobId}`) return job;
        return null;
      },
      set: async (key, value) => {
        if (key === `automation:job:${jobId}`) {
          job = value;
        }
      },
    };

    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: { callback_query: { data: 'reject:job_test_2', id: 'cq_2' } },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);

    assert.deepEqual(responseData, { ok: true });
    // "Request changes" via Telegram is feedback, not a veto — job stays open so
    // other reviewers can still vote. Only the rejections array gains the entry.
    assert.notEqual(job.status, 'rejected');
    assert.ok(Array.isArray(job.rejections) && job.rejections.includes('telegram'));

    // Verify only answerCallbackQuery was called, not publish
    const telegramCall = fetchCalls.find((c) => c.url.includes('answerCallbackQuery'));
    assert.ok(telegramCall, 'answerCallbackQuery should be called');
    const publishCall = fetchCalls.find((c) => c.url.includes('/api/publish'));
    assert.ok(!publishCall, 'publish API should NOT be called for change requests');
  });

  await t.test('ignores callback for non-existent job', async () => {
    let fetchCalls = [];

    const kvMock = {
      get: async (key) => null, // Job doesn't exist
      set: async () => {},
    };

    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: { callback_query: { data: 'approve:job_nonexistent', id: 'cq_3' } },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);

    assert.deepEqual(responseData, { ok: true });

    // Verify answerCallbackQuery was called with "not found" message
    const telegramCall = fetchCalls.find((c) => c.url.includes('answerCallbackQuery'));
    assert.ok(telegramCall, 'answerCallbackQuery should be called');
    const body = JSON.parse(telegramCall.opts.body);
    assert.ok(body.text.includes('not found') || body.text.includes('Job not found'));
  });

  await t.test('ignores callback for terminal status jobs', async () => {
    let fetchCalls = [];

    const jobId = 'job_terminal';
    const job = {
      id: jobId,
      status: 'published', // Terminal status
      createdAt: '2026-03-20T10:00:00Z',
    };

    const kvMock = {
      get: async (key) => {
        if (key === `automation:job:${jobId}`) return job;
        return null;
      },
      set: async () => {},
    };

    const fetchMock = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ({}) };
    };

    global.fetch = fetchMock;

    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: { callback_query: { data: 'approve:job_terminal', id: 'cq_4' } },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
          return res;
        },
      }),
    };

    const handler = createHandler(kvMock);
    await handler(req, res);

    assert.deepEqual(responseData, { ok: true });

    // Verify answerCallbackQuery was called with "already published" message
    const telegramCall = fetchCalls.find((c) => c.url.includes('answerCallbackQuery'));
    assert.ok(telegramCall, 'answerCallbackQuery should be called');
    const body = JSON.parse(telegramCall.opts.body);
    assert.ok(body.text.includes('Already'));
  });
  // Fail-closed checks. A small recording res so a handler that never answers
  // fails the test instead of passing vacuously.
  function recRes() {
    const r = { statusCode: null, body: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  }
  const callbackBody = { callback_query: { data: 'approve:job_x', id: 'cq_x' } };
  const touchKv = { get: async () => { throw new Error('kv must not be read'); }, set: async () => { throw new Error('kv must not be written'); } };

  await t.test('503 when TELEGRAM_WEBHOOK_SECRET is unset, even with no header (was: undefined === undefined → open)', async () => {
    const saved = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      const res = recRes();
      await createHandler(touchKv)({ method: 'POST', headers: {}, body: callbackBody }, res);
      assert.equal(res.statusCode, 503);
      assert.match(res.body.error, /TELEGRAM_WEBHOOK_SECRET/);
    } finally {
      process.env.TELEGRAM_WEBHOOK_SECRET = saved;
    }
  });

  await t.test('401 when the secret header is missing', async () => {
    const res = recRes();
    await createHandler(touchKv)({ method: 'POST', headers: {}, body: callbackBody }, res);
    assert.equal(res.statusCode, 401);
  });

  await t.test('401 when the secret header differs only in length', async () => {
    const res = recRes();
    await createHandler(touchKv)({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'test-secret-longer' }, body: callbackBody }, res);
    assert.equal(res.statusCode, 401);
  });

  // Social autopilot review buttons (sapprove/sreject). `decide`/`closeReviewMessage` are the
  // real functions from lib/social/pack/review.js, dynamically imported by the handler — so
  // these drive them for real against an in-memory store standing in for `kvInstance`, and
  // stub globalThis.fetch for every Telegram call (answerCallbackQuery, and closeReviewMessage's
  // editMessageReplyMarkup/sendMessage, which use the DEFAULT `fetch` param, not an injected one).
  await t.test('social review buttons (sapprove/sreject)', async (t2) => {
    const savedChat = process.env.TELEGRAM_CHAT_ID;
    const savedApprovers = process.env.TELEGRAM_APPROVER_IDS;
    const savedToken = process.env.TELEGRAM_BOT_TOKEN;
    const savedFetch = global.fetch;
    t2.after(() => {
      if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
      if (savedApprovers === undefined) delete process.env.TELEGRAM_APPROVER_IDS; else process.env.TELEGRAM_APPROVER_IDS = savedApprovers;
      if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
      global.fetch = savedFetch;
    });

    /** Answers like Upstash: SET returns 'OK', and SET NX on an existing key returns null. */
    function socialKv(initial = {}) {
      const map = new Map(Object.entries(initial));
      return {
        get: async (key) => map.get(key) ?? null,
        set: async (key, val, opts) => {
          if (opts?.nx && map.has(key)) return null;
          map.set(key, val);
          return 'OK';
        },
        _map: map,
      };
    }

    await t2.test('an allowed press approves and records the decision in its own decision key', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      delete process.env.TELEGRAM_APPROVER_IDS;
      process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
      const kvMock = socialKv({ 'social:pack:c1': { contentId: 'c1', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq1', data: 'sapprove:c1', from: { id: 42, username: 'alice' }, message: { chat: { id: 111 }, message_id: 999 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true });

      const decision = kvMock._map.get('social:pack:c1:decision');
      assert.equal(decision.decision, 'approved');
      assert.equal(decision.by, 'alice');
      assert.equal(decision.byId, '42');
      assert.equal(decision.via, 'telegram');

      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.ok(answer, 'answerCallbackQuery should have been called');
      assert.match(JSON.parse(answer.opts.body).text, /Approved — schedules on the next run/);

      // closeReviewMessage fires with the callback's OWN chat/message ids (from callback_query.message).
      const edit = calls.find((c) => c.url.includes('editMessageReplyMarkup'));
      assert.ok(edit, 'editMessageReplyMarkup should have been called');
      assert.equal(JSON.parse(edit.opts.body).chat_id, 111);
      assert.equal(JSON.parse(edit.opts.body).message_id, 999);
      const send = calls.find((c) => c.url.includes('sendMessage'));
      assert.ok(send, 'closeReviewMessage should have sent a reply');
      assert.match(JSON.parse(send.opts.body).text, /Approved by alice/);
    });

    await t2.test('an allowed press rejects and records the decision, with a rejection close message', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      delete process.env.TELEGRAM_APPROVER_IDS;
      process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
      const kvMock = socialKv({ 'social:pack:c2': { contentId: 'c2', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq8', data: 'sreject:c2', from: { id: 7, username: 'bob' }, message: { chat: { id: 111 }, message_id: 20 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      const decision = kvMock._map.get('social:pack:c2:decision');
      assert.equal(decision.decision, 'rejected');
      assert.equal(decision.by, 'bob');

      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.match(JSON.parse(answer.opts.body).text, /Rejected — not posting/);
      const send = calls.find((c) => c.url.includes('sendMessage'));
      assert.match(JSON.parse(send.opts.body).text, /Rejected by bob/);
    });

    await t2.test('a press from the wrong chat is refused, and nothing is recorded', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      delete process.env.TELEGRAM_APPROVER_IDS;
      const kvMock = socialKv({ 'social:pack:c1': { contentId: 'c1', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq2', data: 'sapprove:c1', from: { id: 42 }, message: { chat: { id: 222 }, message_id: 5 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(kvMock._map.has('social:pack:c1:decision'), false);
      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.match(JSON.parse(answer.opts.body).text, /Not authorised to review/);
      assert.equal(calls.filter((c) => c.url.includes('editMessageReplyMarkup')).length, 0);
      assert.equal(calls.filter((c) => c.url.includes('sendMessage')).length, 0);
    });

    await t2.test('TELEGRAM_CHAT_ID unset refuses every press — fails closed, not open', async () => {
      delete process.env.TELEGRAM_CHAT_ID;
      delete process.env.TELEGRAM_APPROVER_IDS;
      const kvMock = socialKv({ 'social:pack:c1': { contentId: 'c1', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq3', data: 'sapprove:c1', from: { id: 42 }, message: { chat: { id: 111 }, message_id: 5 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      assert.equal(kvMock._map.has('social:pack:c1:decision'), false);
      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.match(JSON.parse(answer.opts.body).text, /Not authorised to review/);
    });

    await t2.test('an approver allowlist refuses a user not on it', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      process.env.TELEGRAM_APPROVER_IDS = '1,2,3';
      const kvMock = socialKv({ 'social:pack:c1': { contentId: 'c1', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq4', data: 'sapprove:c1', from: { id: 999 }, message: { chat: { id: 111 }, message_id: 5 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      assert.equal(kvMock._map.has('social:pack:c1:decision'), false);
      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.match(JSON.parse(answer.opts.body).text, /Not authorised to review/);
    });

    await t2.test('an approver allowlist with whitespace and multiple ids allows a listed user', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      process.env.TELEGRAM_APPROVER_IDS = ' 1 , 2 , 42 ';
      const kvMock = socialKv({ 'social:pack:c1': { contentId: 'c1', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq5', data: 'sapprove:c1', from: { id: 42, username: 'listed' }, message: { chat: { id: 111 }, message_id: 5 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      const decision = kvMock._map.get('social:pack:c1:decision');
      assert.equal(decision.decision, 'approved');
      assert.equal(decision.by, 'listed');
    });

    await t2.test('a callback with no message object refuses the press (fails closed, does not crash)', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      delete process.env.TELEGRAM_APPROVER_IDS;
      const kvMock = socialKv({ 'social:pack:c1': { contentId: 'c1', status: 'rendered' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq6', data: 'sapprove:c1', from: { id: 42 } } }, // no `message`
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(kvMock._map.has('social:pack:c1:decision'), false);
      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.match(JSON.parse(answer.opts.body).text, /Not authorised to review/);
    });

    await t2.test('an allowed press approves an ARCHIVED pack too — decide() accepts archived, not just rendered', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      delete process.env.TELEGRAM_APPROVER_IDS;
      process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
      const kvMock = socialKv({ 'social:pack:c9': { contentId: 'c9', status: 'archived' } });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq9', data: 'sapprove:c9', from: { id: 42, username: 'alice' }, message: { chat: { id: 111 }, message_id: 909 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      assert.equal(res.statusCode, 200);
      const decision = kvMock._map.get('social:pack:c9:decision');
      assert.equal(decision.decision, 'approved');
      assert.equal(decision.by, 'alice');

      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.ok(answer, 'answerCallbackQuery should have been called');
      assert.match(JSON.parse(answer.opts.body).text, /Approved — schedules on the next run/);

      // The message is closed the same as it would be for a rendered pack.
      const edit = calls.find((c) => c.url.includes('editMessageReplyMarkup'));
      assert.ok(edit, 'editMessageReplyMarkup should have been called');
      assert.equal(JSON.parse(edit.opts.body).chat_id, 111);
      assert.equal(JSON.parse(edit.opts.body).message_id, 909);
      const send = calls.find((c) => c.url.includes('sendMessage'));
      assert.ok(send, 'closeReviewMessage should have sent a reply');
      assert.match(JSON.parse(send.opts.body).text, /Approved by alice/);
    });

    await t2.test('a decide() "already decided" outcome answers "No change: …" and never calls closeReviewMessage', async () => {
      process.env.TELEGRAM_CHAT_ID = '111';
      delete process.env.TELEGRAM_APPROVER_IDS;
      const kvMock = socialKv({
        'social:pack:c1': { contentId: 'c1', status: 'rendered' },
        'social:pack:c1:decision': { decision: 'rejected', by: 'carol', via: 'telegram' },
      });
      const calls = [];
      global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cq7', data: 'sapprove:c1', from: { id: 42, username: 'late' }, message: { chat: { id: 111 }, message_id: 5 } } },
      };
      const res = recRes();
      await createHandler(kvMock)(req, res);

      // The pre-existing decision is untouched — the late press changed nothing.
      assert.deepEqual(kvMock._map.get('social:pack:c1:decision'), { decision: 'rejected', by: 'carol', via: 'telegram' });

      const answer = calls.find((c) => c.url.includes('answerCallbackQuery'));
      assert.equal(JSON.parse(answer.opts.body).text, 'No change: already rejected by carol');
      assert.equal(calls.filter((c) => c.url.includes('editMessageReplyMarkup')).length, 0);
      assert.equal(calls.filter((c) => c.url.includes('sendMessage')).length, 0);
    });
  });
});

test('isAllowedReviewer', async (t) => {
  let savedChat;
  let savedApprovers;
  t.beforeEach(() => {
    savedChat = process.env.TELEGRAM_CHAT_ID;
    savedApprovers = process.env.TELEGRAM_APPROVER_IDS;
  });
  t.afterEach(() => {
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = savedChat;
    if (savedApprovers === undefined) delete process.env.TELEGRAM_APPROVER_IDS; else process.env.TELEGRAM_APPROVER_IDS = savedApprovers;
  });

  await t.test('matches a numeric chat id against the configured (string) chat id', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    delete process.env.TELEGRAM_APPROVER_IDS;
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 1 } }), true);
  });

  await t.test('matches a negative Telegram group chat id', () => {
    process.env.TELEGRAM_CHAT_ID = '-1001234567890';
    delete process.env.TELEGRAM_APPROVER_IDS;
    assert.equal(isAllowedReviewer({ message: { chat: { id: -1001234567890 } }, from: { id: 1 } }), true);
  });

  await t.test('rejects a chat id that does not match the configured one', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    delete process.env.TELEGRAM_APPROVER_IDS;
    assert.equal(isAllowedReviewer({ message: { chat: { id: 222 } }, from: { id: 1 } }), false);
  });

  await t.test('fails closed when TELEGRAM_CHAT_ID is unset, even with a chat present', () => {
    delete process.env.TELEGRAM_CHAT_ID;
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 1 } }), false);
  });

  await t.test('fails closed when there is no message object at all', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    assert.equal(isAllowedReviewer({ from: { id: 1 } }), false);
  });

  await t.test('fails closed when callbackQuery itself is undefined', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    assert.equal(isAllowedReviewer(undefined), false);
  });

  await t.test('with no approver list configured, any user in the right chat is allowed', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    delete process.env.TELEGRAM_APPROVER_IDS;
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 999999 } }), true);
  });

  await t.test('with an approver list, a numeric from.id matching a listed string id is allowed', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    process.env.TELEGRAM_APPROVER_IDS = '42';
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 42 } }), true);
  });

  await t.test('with an approver list, an unlisted from.id is refused', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    process.env.TELEGRAM_APPROVER_IDS = '42';
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 43 } }), false);
  });

  await t.test('an approver list with surrounding whitespace and multiple ids still matches', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    process.env.TELEGRAM_APPROVER_IDS = ' 1 , 42 , 7 ';
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 42 } }), true);
  });

  await t.test('fails closed when `from` is missing entirely and an approver list is configured', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    process.env.TELEGRAM_APPROVER_IDS = '42';
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } } }), false);
  });

  await t.test('an empty TELEGRAM_APPROVER_IDS string is treated as no allowlist (commas-only also collapses to none)', () => {
    process.env.TELEGRAM_CHAT_ID = '111';
    process.env.TELEGRAM_APPROVER_IDS = ' , , ';
    assert.equal(isAllowedReviewer({ message: { chat: { id: 111 } }, from: { id: 12345 } }), true);
  });
});
