import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionPlaybackRate } from '../js/adaptive-playback.js';

test('slows down before motion and keeps the outcome visible afterward', () => {
  const motion = [[10, 12, 19, 1], [30, 35, 20, 0]];
  assert.equal(motionPlaybackRate(motion, 8, 1), 16);
  for (const time of [9, 10, 12, 13, 30, 35]) assert.equal(motionPlaybackRate(motion, time, 1), 4);
  assert.equal(motionPlaybackRate(motion, 14, 1), 16);
});

test('accounts for videos already encoded at double speed', () => {
  assert.equal(motionPlaybackRate([[10, 12]], 11, 2), 2);
  assert.equal(motionPlaybackRate([[10, 12]], 20, 2), 8);
});

test('handles seeking backwards and overlapping motion records', () => {
  const motion = [[10, 30], [15, 20]];
  assert.equal(motionPlaybackRate(motion, 40, 1), 16);
  assert.equal(motionPlaybackRate(motion, 25, 1), 4);
  assert.equal(motionPlaybackRate([], 0, 1), 16);
});
