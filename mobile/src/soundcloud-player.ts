export function buildSoundCloudPlayer(trackUrl: string): string {
  const safeTrackUrl = JSON.stringify(trackUrl).replace(/</g, '\\u003c');

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <style>
      html, body { margin: 0; padding: 0; background: #1b1f26; }
      iframe { display: block; width: 100%; height: 270px; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="sc-widget" allow="autoplay" scrolling="no"></iframe>
    <script src="https://w.soundcloud.com/player/api.js"></script>
    <script>
      (function () {
        var iframe = document.getElementById('sc-widget');
        iframe.src = 'https://w.soundcloud.com/player/?url=' +
          encodeURIComponent(${safeTrackUrl}) + '&auto_play=false&visual=true&hide_related=true';
        var widget = SC.Widget(iframe);
        var lastProgressSentAt = 0;
        function send(message) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          }
        }
        function sendPlaying() {
          widget.getCurrentSound(function (sound) {
            if (!sound) return;
            widget.getPosition(function (positionMs) {
              send({
                type: 'playing',
                positionMs: Number(positionMs) || 0,
                track: {
                  title: String(sound.title || 'Unknown track').slice(0, 128),
                  artist: String((sound.user && sound.user.username) || 'Unknown artist').slice(0, 128),
                  permalinkUrl: String(sound.permalink_url || ''),
                  durationMs: Number(sound.duration) || 0
                }
              });
            });
          });
        }
        widget.bind(SC.Widget.Events.READY, function () {
          widget.bind(SC.Widget.Events.PLAY, sendPlaying);
          widget.bind(SC.Widget.Events.PAUSE, function () { send({ type: 'paused' }); });
          widget.bind(SC.Widget.Events.FINISH, function () { send({ type: 'finished' }); });
          widget.bind(SC.Widget.Events.PLAY_PROGRESS, function (event) {
            var now = Date.now();
            if (now - lastProgressSentAt < 15000) return;
            lastProgressSentAt = now;
            sendPlaying();
          });
        });
        widget.bind(SC.Widget.Events.ERROR, function () {
          send({ type: 'error', message: 'SoundCloud 플레이어에서 오류가 발생했습니다.' });
        });
      })();
    </script>
  </body>
</html>`;
}
