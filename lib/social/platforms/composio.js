// lib/social/platforms/composio.js
// Composio-backed posting adapter — one adapter for all five platforms,
// selected per kit by the connected account. Maps a kit's platform slice to
// the right Composio tool slug + arguments and normalises the result to
// { postId }, matching the legacy env-var adapters.
//
// SLUGS + ARG NAMES VERIFIED 2026-07-01 against the live Composio toolkit
// schemas (GET backend.composio.dev/api/v3/tools?toolkit_slug=<x>). See the
// per-platform notes. What is NOT yet solved: several tools REQUIRE an
// account-scoped identifier that only exists once an account is connected —
// LinkedIn `author` (urn:li:person:…/organization:…), Facebook `page_id`,
// Instagram `ig_user_id`. These must be captured into the account record
// (lib/social/accounts.js) at connect time and are read here as
// acct.authorUrn / acct.pageId / acct.igUserId. Each guarded with a clear throw.

import { executeTool } from '../composio.js';

// Verified tool slugs per platform action.
const SLUGS = {
  twitter_post:      'TWITTER_CREATION_OF_A_POST',      // verified (no required args)
  linkedin_post:     'LINKEDIN_CREATE_LINKED_IN_POST',  // verified — required: author, commentary
  facebook_feed:     'FACEBOOK_CREATE_POST',            // verified — required: page_id, message
  facebook_photo:    'FACEBOOK_CREATE_PHOTO_POST',      // verified — required: page_id (url/photo + message)
  instagram_create:  'INSTAGRAM_CREATE_MEDIA_CONTAINER',// verified — required: ig_user_id
  instagram_publish: 'INSTAGRAM_CREATE_POST',           // verified — required: ig_user_id, creation_id
  tiktok_upload:     'TIKTOK_UPLOAD_VIDEO',             // verified — args: file_to_upload, caption, publish
};

function fullCaption(data) {
  const tags = Array.isArray(data.hashtags) && data.hashtags.length
    ? '\n\n' + data.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
    : '';
  return `${data.caption || ''}${tags}`.trim();
}

async function postTwitter(data, acct) {
  // Thread of up to 3 posts, chained as replies.
  const thread = Array.isArray(data.thread) && data.thread.length
    ? data.thread
    : [fullCaption(data)];
  let firstId = null;
  let prevId = null;
  for (const text of thread) {
    const args = { text };
    // Verified nested arg name (Composio flattens with `__`).
    if (prevId) args.reply__in__reply__to__tweet__id = prevId;
    // NOTE: this tool attaches media by pre-uploaded media__media__ids, not a URL,
    // so images aren't posted here (text/thread only).
    const out = await executeTool(SLUGS.twitter_post, {
      connectedAccountId: acct.connectedAccountId,
      arguments: args,
    });
    const id = out?.id || out?.data?.id || out?.tweet_id;
    if (!firstId) firstId = id;
    prevId = id;
  }
  return { postId: firstId };
}

async function postLinkedIn(data, acct) {
  if (!acct.authorUrn) {
    throw new Error('LinkedIn account missing authorUrn (urn:li:person:… or urn:li:organization:…) — capture it at connect time');
  }
  // Verified: required author + commentary; visibility optional. No media arg on
  // this tool, so images are not attached (text post).
  const args = {
    author: acct.authorUrn,
    commentary: fullCaption(data),
    visibility: 'PUBLIC',
  };
  const out = await executeTool(SLUGS.linkedin_post, {
    connectedAccountId: acct.connectedAccountId,
    arguments: args,
  });
  return { postId: out?.id || out?.share_id || out?.urn || out?.activity || null };
}

async function postFacebook(data, acct) {
  if (!acct.pageId) throw new Error('Facebook account missing pageId — capture it at connect time');
  const message = fullCaption(data);
  if (data.image?.url) {
    const out = await executeTool(SLUGS.facebook_photo, {
      connectedAccountId: acct.connectedAccountId,
      arguments: { url: data.image.url, message, page_id: acct.pageId },
    });
    return { postId: out?.id || out?.post_id || null };
  }
  const args = { message, page_id: acct.pageId };
  if (data.link) args.link = data.link;
  const out = await executeTool(SLUGS.facebook_feed, {
    connectedAccountId: acct.connectedAccountId,
    arguments: args,
  });
  return { postId: out?.id || out?.post_id || null };
}

async function postInstagram(data, acct) {
  if (!acct.igUserId) throw new Error('Instagram account missing igUserId — capture it at connect time');
  // Two-step: create media container, then publish it. Verified arg names.
  const isReel = Boolean(data.video?.url);
  const createArgs = isReel
    ? { ig_user_id: acct.igUserId, media_type: 'REELS', video_url: data.video.url, caption: fullCaption(data) }
    : { ig_user_id: acct.igUserId, image_url: data.image?.url, caption: fullCaption(data) };
  const created = await executeTool(SLUGS.instagram_create, {
    connectedAccountId: acct.connectedAccountId,
    arguments: createArgs,
  });
  const creationId = created?.id || created?.creation_id || created?.container_id;
  if (!creationId) throw new Error('Instagram: no creation/container id returned');
  const published = await executeTool(SLUGS.instagram_publish, {
    connectedAccountId: acct.connectedAccountId,
    arguments: { ig_user_id: acct.igUserId, creation_id: creationId },
  });
  return { postId: published?.id || creationId };
}

async function postTikTok(data, acct) {
  if (!data.video?.url) throw new Error('TikTok requires a video — none in kit');
  // Verified: file_to_upload (Composio accepts a URL for file params), caption, publish.
  const out = await executeTool(SLUGS.tiktok_upload, {
    connectedAccountId: acct.connectedAccountId,
    arguments: { file_to_upload: data.video.url, caption: fullCaption(data), publish: true },
  });
  return { postId: out?.publish_id || out?.id || null };
}

const ROUTERS = {
  twitter:   postTwitter,
  linkedin:  postLinkedIn,
  facebook:  postFacebook,
  instagram: postInstagram,
  tiktok:    postTikTok,
};

/**
 * Post a kit's platform slice via the given Composio-connected account.
 * @param {string} platform
 * @param {object} platformData - the kit.platforms[platform] slice
 * @param {object} account - { connectedAccountId, authorUrn?, pageId?, igUserId?, ... }
 * @returns {Promise<{ postId: string|null }>}
 */
export async function postViaComposio(platform, platformData, account) {
  const router = ROUTERS[platform];
  if (!router) throw new Error(`No Composio router for platform "${platform}"`);
  if (!account?.connectedAccountId) throw new Error(`Account for ${platform} has no connectedAccountId`);
  // Account-scoped ids (authorUrn/pageId/igUserId) live in account.config in the
  // registry; flatten them so routers can read acct.<key> regardless of shape.
  const acct = { ...(account.config || {}), ...account };
  return router(platformData, acct);
}
