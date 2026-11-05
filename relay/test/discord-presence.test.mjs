import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDiscordPresence } from '../src/discord-presence.mjs';

test('maps SoundCloud track details and playback timing to a listening presence', async () => {
  const activities = [];
  const client = {
    isConnected: true,
    user: {
      setActivity: async (activity) => activities.push(activity),
      clearActivity: async () => activities.push(null),
    },
  };
  const presence = createDiscordPresence(client);

  await presence.setPlaying({
    title: 'Track',
    artist: 'Artist',
    url: 'https://soundcloud.com/artist/track',
    positionMs: 1000,
    durationMs: 60000,
  });

  assert.equal(activities.length, 1);
  assert.equal(activities[0].name, 'SoundCloud');
  assert.equal(activities[0].type, 2);
  assert.equal(activities[0].details, 'Track');
  assert.equal(activities[0].state, 'Artist');
  assert.ok(activities[0].startTimestamp instanceof Date);
  assert.ok(activities[0].endTimestamp instanceof Date);
  assert.deepEqual(activities[0].buttons, [{
    label: 'Listen on SoundCloud',
    url: 'https://soundcloud.com/artist/track',
  }]);

  await presence.clear();
  assert.equal(activities[1], null);
});

test('reports when Discord is not connected instead of silently dropping a presence update', async () => {
  const presence = createDiscordPresence({ isConnected: false, user: null });
  await assert.rejects(
    presence.setPlaying({
      title: 'Track',
      artist: 'Artist',
      url: 'https://soundcloud.com/artist/track',
      positionMs: 0,
      durationMs: 60000,
    }),
    /Discord desktop is not connected/,
  );
});
