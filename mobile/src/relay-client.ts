export type RelaySettings = {
  url: string;
  token: string;
};

export type SoundCloudTrack = {
  title: string;
  artist: string;
  permalinkUrl: string;
  durationMs: number;
};

export async function pairRelay(settings: RelaySettings): Promise<void> {
  validateRelaySettings(settings);
  await relayRequest(settings, '/pair', {});
}

export async function sendPlayback(
  settings: RelaySettings,
  playback: { track: SoundCloudTrack; positionMs: number } | null,
): Promise<void> {
  validateRelaySettings(settings);
  if (!playback) {
    await relayRequest(settings, '/presence', { type: 'stopped' });
    return;
  }

  await relayRequest(settings, '/presence', {
    type: 'playing',
    title: playback.track.title,
    artist: playback.track.artist,
    url: playback.track.permalinkUrl,
    positionMs: playback.positionMs,
    durationMs: playback.track.durationMs,
  });
}

async function relayRequest(settings: RelaySettings, path: string, body: object): Promise<void> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    response = await fetch(`${settings.url}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error('PC 중계 앱에 연결할 수 없습니다. 주소와 같은 Wi-Fi 연결을 확인하세요.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) throw new Error('연결 코드가 올바르지 않습니다.');
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const message =
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : '';
    throw new Error(message || `PC 중계 앱 오류 (${response.status})`);
  }
}

function validateRelaySettings(settings: RelaySettings): void {
  if (!settings.token) throw new Error('PC 중계 앱의 연결 코드를 입력해 주세요.');

  let url: URL;
  try {
    url = new URL(settings.url);
  } catch {
    throw new Error('PC 중계 앱 주소를 확인해 주세요.');
  }

  if (
    url.protocol !== 'http:' ||
    !isLocalAddress(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('같은 Wi-Fi의 PC에서 제공한 로컬 http:// 주소를 입력해 주세요.');
  }
}

function isLocalAddress(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;

  const octets = host.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d+$/.test(part))) return false;
  const [first, second] = octets.map(Number);
  if (octets.some((part) => Number(part) > 255)) return false;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
