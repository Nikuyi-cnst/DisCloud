export function createDiscordPresence(client) {
  return {
    async setPlaying(track) {
      if (!client.isConnected || !client.user) {
        throw new Error('Discord desktop is not connected.');
      }

      const now = Date.now();
      const activity = {
        name: 'SoundCloud',
        type: 2,
        details: track.title,
        state: track.artist,
        startTimestamp: new Date(now - track.positionMs),
        buttons: [{ label: 'Listen on SoundCloud', url: track.url }],
      };

      if (track.durationMs > track.positionMs) {
        activity.endTimestamp = new Date(now + track.durationMs - track.positionMs);
      }

      await client.user.setActivity(activity);
    },

    async clear() {
      if (!client.isConnected || !client.user) {
        throw new Error('Discord desktop is not connected.');
      }
      await client.user.clearActivity();
    },
  };
}
