import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRelayServer } from '../src/server.mjs';

const token = 'a'.repeat(32);

async function withRelay(t, presence, options = {}) {
  const server = createRelayServer({ token, presence, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health endpoint is available without pairing', async (t) => {
  const url = await withRelay(t, {});
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('requires a valid pairing code', async (t) => {
  const url = await withRelay(t, {});
  const response = await fetch(`${url}/pair`, {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong' },
    body: '{}',
  });
  assert.equal(response.status, 401);
});

test('forwards valid playback and clears stopped activity', async (t) => {
  const calls = [];
  const presence = {
    setPlaying: async (track) => calls.push(['playing', track]),
    clear: async () => calls.push(['stopped']),
  };
  const url = await withRelay(t, presence);

  const playingResponse = await fetch(`${url}/presence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'playing',
      title: 'Track',
      artist: 'Artist',
      url: 'https://soundcloud.com/artist/track',
      positionMs: 1200,
      durationMs: 60000,
    }),
  });
  assert.equal(playingResponse.status, 200);
  assert.deepEqual(calls[0], ['playing', {
    title: 'Track',
    artist: 'Artist',
    url: 'https://soundcloud.com/artist/track',
    positionMs: 1200,
    durationMs: 60000,
  }]);

  const stoppedResponse = await fetch(`${url}/presence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'stopped' }),
  });
  assert.equal(stoppedResponse.status, 200);
  assert.deepEqual(calls[1], ['stopped']);
});

test('rejects invalid URLs and playback data without updating presence', async (t) => {
  let updated = false;
  const url = await withRelay(t, {
    setPlaying: async () => { updated = true; },
    clear: async () => { updated = true; },
  });
  const response = await fetch(`${url}/presence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'playing',
      title: 'Track',
      artist: 'Artist',
      url: 'https://example.com/track',
      positionMs: 0,
      durationMs: 60000,
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(updated, false);
});

test('clears stale presence when playback updates stop', async (t) => {
  const calls = [];
  const url = await withRelay(t, {
    setPlaying: async () => calls.push('playing'),
    clear: async () => calls.push('stopped'),
  }, { inactivityTimeoutMs: 30 });
  const response = await fetch(`${url}/presence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'playing',
      title: 'Track',
      artist: 'Artist',
      url: 'https://soundcloud.com/artist/track',
      positionMs: 0,
      durationMs: 60000,
    }),
  });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(calls, ['playing', 'stopped']);
});
