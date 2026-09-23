// lib/social/pack/images.js — 9:16 stills per key point.
// `imagePack` is injected with `generate`, so no real OpenRouter image call or Blob upload
// ever happens here (see image-client.test.js for the default `generate` implementation).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STILLS_PER_PACK, STYLE_SUFFIX, briefToPrompt, briefsFor, imagePack, applyImages,
} from './images.js';

describe('briefToPrompt', () => {
  it('collapses whitespace runs (including tabs and newlines) and strips <>{}', () => {
    const brief = '  A story   about <tags> and {braces}\n\twith   line breaks  ';
    const prompt = briefToPrompt(brief, { headline: 'unused' });
    assert.equal(prompt, `A story about  tags  and  braces  with line breaks. ${STYLE_SUFFIX}`);
  });

  it('caps the cleaned brief at 300 characters before appending the house style', () => {
    const longBrief = 'x'.repeat(400);
    const prompt = briefToPrompt(longBrief, { headline: 'unused' });
    assert.equal(prompt, `${'x'.repeat(300)}. ${STYLE_SUFFIX}`);
  });

  it('falls back to the headline when the brief is missing', () => {
    const prompt = briefToPrompt(undefined, { headline: 'A Big Story Breaks' });
    assert.equal(prompt, `An editorial scene illustrating: A Big Story Breaks. ${STYLE_SUFFIX}`);
  });

  it('falls back to the headline when the brief is an empty or whitespace-only string', () => {
    assert.equal(
      briefToPrompt('', { headline: 'Fallback' }),
      `An editorial scene illustrating: Fallback. ${STYLE_SUFFIX}`,
    );
    assert.equal(
      briefToPrompt('   ', { headline: 'Fallback' }),
      `An editorial scene illustrating: Fallback. ${STYLE_SUFFIX}`,
    );
  });

  it('truncates a very long fallback headline to 160 characters', () => {
    const headline = 'H'.repeat(200);
    const prompt = briefToPrompt(null, { headline });
    assert.equal(prompt, `An editorial scene illustrating: ${'H'.repeat(160)}. ${STYLE_SUFFIX}`);
  });
});

describe('briefsFor', () => {
  it('takes the first N points that have a brief, keeping their original indices', () => {
    const pack = {
      points: [
        { imageBrief: 'a' },
        { caption: 'no brief here' },
        { imageBrief: 'b' },
        { imageBrief: 'c' },
      ],
    };
    assert.deepEqual(briefsFor(pack, 2), [
      { index: 0, brief: 'a' },
      { index: 2, brief: 'b' },
    ]);
  });

  it('defaults to STILLS_PER_PACK (2) when no count is given', () => {
    const pack = { points: [{ imageBrief: 'a' }, { imageBrief: 'b' }, { imageBrief: 'c' }] };
    assert.equal(STILLS_PER_PACK, 2);
    assert.deepEqual(briefsFor(pack), [
      { index: 0, brief: 'a' },
      { index: 1, brief: 'b' },
    ]);
  });

  it('returns fewer than count when fewer points have a brief', () => {
    const pack = { points: [{ caption: 'x' }, { imageBrief: 'only one' }, { caption: 'y' }] };
    assert.deepEqual(briefsFor(pack, 5), [{ index: 1, brief: 'only one' }]);
  });

  it('returns an empty array when the pack has no points at all', () => {
    assert.deepEqual(briefsFor({}), []);
    assert.deepEqual(briefsFor({ points: [] }), []);
  });

  it('filters out points with a falsy brief (empty string, null, undefined)', () => {
    const pack = {
      points: [{ imageBrief: '' }, { imageBrief: null }, { imageBrief: undefined }, { imageBrief: 'real' }],
    };
    assert.deepEqual(briefsFor(pack, 10), [{ index: 3, brief: 'real' }]);
  });
});

describe('imagePack', () => {
  it('stores the hero at index 0 and appends generated stills at the matching point indices', async () => {
    const pack = {
      images: [{ src: 'https://cdn.example/hero.jpg', aspect: 16 / 9, alt: 'Hero' }],
      points: [
        { caption: 'Point one', imageBrief: 'brief one' },
        { caption: 'Point two', imageBrief: 'brief two' },
      ],
    };
    const calls = [];
    const generate = async (prompt, opts) => {
      calls.push({ prompt, opts });
      return `https://gen.example/${opts.name}.jpg`;
    };

    const result = await imagePack(pack, { pathId: 'story-1', generate });

    assert.deepEqual(result.images, [
      { src: 'https://cdn.example/hero.jpg', aspect: 16 / 9, alt: 'Hero' },
      { src: 'https://gen.example/still-p1.jpg', aspect: 9 / 16, alt: 'Point one' },
      { src: 'https://gen.example/still-p2.jpg', aspect: 9 / 16, alt: 'Point two' },
    ]);
    assert.equal(result.points[0].image, 1);
    assert.equal(result.points[1].image, 2);
    assert.deepEqual(result.stored, {
      p1: 'https://gen.example/still-p1.jpg',
      p2: 'https://gen.example/still-p2.jpg',
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].opts.pathId, 'story-1');
    assert.equal(calls[0].opts.aspectRatio, '9:16');
  });

  it('starts the images array at index 0 when the pack has no hero image', async () => {
    const pack = { points: [{ caption: 'C1', imageBrief: 'b1' }] };
    const generate = async () => 'https://gen.example/still.jpg';

    const result = await imagePack(pack, { pathId: 'story-2', generate });

    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].src, 'https://gen.example/still.jpg');
    assert.equal(result.points[0].image, 0);
  });

  it('skips a key already present in `existing` without calling generate for it again', async () => {
    const pack = {
      points: [
        { caption: 'C1', imageBrief: 'b1' },
        { caption: 'C2', imageBrief: 'b2' },
      ],
    };
    const existing = { p1: 'https://existing.example/p1.jpg' };
    const calls = [];
    const generate = async (prompt, opts) => {
      calls.push(opts.name);
      return `https://gen.example/${opts.name}.jpg`;
    };

    const result = await imagePack(pack, { pathId: 'story-3', existing, generate });

    assert.deepEqual(calls, ['still-p2']); // p1 was never regenerated
    assert.equal(result.images[0].src, 'https://existing.example/p1.jpg');
    assert.equal(result.stored.p1, 'https://existing.example/p1.jpg');
  });

  it('keeps going when one image fails — that point gets no image index, and does not throw', async () => {
    const pack = {
      points: [
        { caption: 'C1', imageBrief: 'b1' },
        { caption: 'C2', imageBrief: 'b2' },
      ],
    };
    const generate = async (prompt, opts) => {
      if (opts.name === 'still-p1') throw new Error('model blew up');
      return `https://gen.example/${opts.name}.jpg`;
    };

    const result = await imagePack(pack, { pathId: 'story-4', generate }); // must resolve, not reject

    assert.equal(result.points[0].image, undefined); // falls back to the hero at render time
    assert.equal('p1' in result.stored, false);
    assert.equal(result.images.length, 1); // only p2's still was added
    assert.equal(result.images[0].src, 'https://gen.example/still-p2.jpg');
    assert.equal(result.points[1].image, 0);
  });

  it('stops starting new images once past budget, without disturbing an already-stored one', async () => {
    const pack = {
      points: [
        { caption: 'C1', imageBrief: 'b1' },
        { caption: 'C2', imageBrief: 'b2' },
      ],
    };
    const existing = { p1: 'https://existing.example/p1.jpg' };
    const generate = async () => { throw new Error('generate should not have been called'); };

    const result = await imagePack(pack, {
      pathId: 'story-5',
      existing,
      generate,
      startedAt: Date.now() - 200_000, // past the 150_000ms default budget
    });

    assert.equal(result.images.length, 1); // p1 only, reused from existing
    assert.equal(result.images[0].src, 'https://existing.example/p1.jpg');
    assert.equal(result.points[1].image, undefined); // p2 was never started
    assert.deepEqual(result.stored, existing);
  });

  it("rejects an unsafe pathId before calling generate — stops one story writing into another's folder", async () => {
    const pack = { points: [{ caption: 'C1', imageBrief: 'b1' }] };
    const generate = async () => { throw new Error('generate should not have been called'); };
    await assert.rejects(imagePack(pack, { pathId: '../evil', generate }), /unsafe path segment/);
  });

  it('rejects a pathId containing a slash even without traversal dots', async () => {
    const pack = { points: [] };
    const generate = async () => { throw new Error('generate should not have been called'); };
    await assert.rejects(imagePack(pack, { pathId: 'a/b', generate }), /unsafe path segment/);
  });
});

describe('applyImages', () => {
  it('merges images and points into a new pack object without mutating the input', () => {
    const pack = { headline: 'H', images: [], points: [{ caption: 'old' }] };
    const images = [{ src: 'a' }];
    const points = [{ caption: 'new', image: 0 }];

    const result = applyImages(pack, { images, points });

    assert.deepEqual(result, { headline: 'H', images, points });
    assert.equal(pack.images.length, 0); // original untouched
    assert.equal(pack.points[0].caption, 'old');
  });
});
