import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TRACK_LENGTH_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INACTIVITY_TIMEOUT_MS = 45_000;

export function createRelayServer({ token, presence, inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS }) {
  if (!token || !presence) throw new Error('A pairing token and presence handler are required.');
  let inactivityTimer;

  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== 'POST' || (path !== '/pair' && path !== '/presence')) {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }

    if (!hasValidToken(request.headers.authorization, token)) {
      sendJson(response, 401, { error: 'Invalid pairing token.' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      if (path === '/pair') {
        sendJson(response, 200, { ok: true });
        return;
      }

      const playback = validatePlayback(body);
      if (playback === null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = undefined;
        await presence.clear();
      } else {
        await presence.setPlaying(playback);
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(async () => {
          inactivityTimer = undefined;
          try {
            await presence.clear();
          } catch (error) {
            console.error('Could not clear expired Discord Rich Presence:', error);
          }
        }, inactivityTimeoutMs);
        inactivityTimer.unref?.();
      }
      sendJson(response, 200, { ok: true });
    } catch (error) {
      const status = error instanceof RelayRequestError ? error.status : 503;
      if (status === 503) console.error('Discord Rich Presence update failed:', error);
      sendJson(response, status, {
        error: status === 503 ? 'Discord Rich Presence could not be updated.' : error.message,
      });
    }
  });

  server.on('close', () => clearTimeout(inactivityTimer));
  return server;
}

function hasValidToken(authorization, expectedToken) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new RelayRequestError(413, 'Request body is too large.');
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RelayRequestError(400, 'Request body must be valid JSON.');
  }
}

function validatePlayback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RelayRequestError(400, 'Request body must be an object.');
  }
  if (body.type === 'stopped') return null;
  if (body.type !== 'playing') throw new RelayRequestError(400, 'Unknown playback state.');

  const title = boundedText(body.title);
  const artist = boundedText(body.artist);
  if (!title || !artist) throw new RelayRequestError(400, 'Track title and artist are required.');

  let url;
  try {
    url = new URL(body.url);
  } catch {
    throw new RelayRequestError(400, 'A SoundCloud track URL is required.');
  }
  if (
    url.protocol !== 'https:' ||
    !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname.toLowerCase())
  ) {
    throw new RelayRequestError(400, 'Only SoundCloud track URLs are accepted.');
  }

  const positionMs = Number(body.positionMs);
  const durationMs = Number(body.durationMs);
  if (!Number.isFinite(positionMs) || positionMs < 0 || positionMs > MAX_TRACK_LENGTH_MS) {
    throw new RelayRequestError(400, 'Track position is invalid.');
  }
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_TRACK_LENGTH_MS) {
    throw new RelayRequestError(400, 'Track duration is invalid.');
  }

  return {
    title,
    artist,
    url: url.toString(),
    positionMs: Math.floor(positionMs),
    durationMs: Math.floor(durationMs),
  };
}

function boundedText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 128);
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

class RelayRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
