import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { buildSoundCloudPlayer } from './src/soundcloud-player';
import {
  pairRelay,
  sendPlayback,
  type RelaySettings,
  type SoundCloudTrack,
} from './src/relay-client';

const SETTINGS_KEY = 'relay-settings';

type PlayerMessage =
  | { type: 'playing'; track: SoundCloudTrack; positionMs: number }
  | { type: 'paused' | 'finished' }
  | { type: 'error'; message: string };

export default function App() {
  const [trackUrl, setTrackUrl] = useState('');
  const [playerUrl, setPlayerUrl] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [settings, setSettings] = useState<RelaySettings | null>(null);
  const [track, setTrack] = useState<SoundCloudTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [status, setStatus] = useState('PC 중계 앱에 연결해 주세요.');
  const [error, setError] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync(SETTINGS_KEY)
      .then(async (saved) => {
        if (!saved) return;
        const parsed: unknown = JSON.parse(saved);
        if (isRelaySettings(parsed)) {
          setSettings(parsed);
          setRelayUrl(parsed.url);
          setPairingToken(parsed.token);
          try {
            await pairRelay(parsed);
            setStatus('저장된 PC 중계 앱에 다시 연결되었습니다.');
          } catch (reason) {
            setStatus('저장된 PC 중계 앱에 연결되지 않았습니다.');
            setError(reason instanceof Error ? reason.message : '연결에 실패했습니다.');
          }
        }
      })
      .catch(() => setError('저장된 연결 정보를 읽지 못했습니다.'));
  }, []);

  useEffect(() => {
    return () => {
      if (settings) void sendPlayback(settings, null).catch(() => undefined);
    };
  }, [settings]);

  const connectRelay = async () => {
    Keyboard.dismiss();
    setError('');
    setIsPairing(true);
    try {
      const nextSettings = {
        url: relayUrl.trim().replace(/\/+$/, ''),
        token: pairingToken.trim(),
      };
      await pairRelay(nextSettings);
      await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(nextSettings));
      setSettings(nextSettings);
      setStatus('PC 중계 앱에 연결되었습니다.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '연결에 실패했습니다.');
      setStatus('PC 중계 앱에 연결되지 않았습니다.');
    } finally {
      setIsPairing(false);
    }
  };

  const loadTrack = () => {
    Keyboard.dismiss();
    setError('');
    const parsed = parseSoundCloudUrl(trackUrl);
    if (!parsed) {
      setError('공개 SoundCloud 트랙 또는 플레이리스트 URL을 입력해 주세요.');
      return;
    }
    if (settings) void sendPlayback(settings, null).catch(() => undefined);
    setTrack(null);
    setIsPlaying(false);
    setPlayerUrl(parsed);
    setStatus(settings ? 'SoundCloud 플레이어를 불러오는 중입니다.' : 'PC를 연결하면 재생 정보가 Discord에 표시됩니다.');
  };

  const handlePlayerMessage = async (event: WebViewMessageEvent) => {
    const message = parsePlayerMessage(event.nativeEvent.data);
    if (!message) {
      setError('SoundCloud 플레이어에서 올바르지 않은 데이터를 받았습니다.');
      return;
    }

    if (message.type === 'error') {
      setError(message.message);
      return;
    }

    if (message.type === 'playing') {
      setTrack(message.track);
      setIsPlaying(true);
      if (!settings) {
        setStatus('재생 중입니다. Discord 표시에는 PC 연결이 필요합니다.');
        return;
      }
      try {
        await sendPlayback(settings, {
          track: message.track,
          positionMs: message.positionMs,
        });
        setStatus('Discord 프로필에 재생 중인 곡을 표시하고 있습니다.');
        setError('');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '재생 정보를 PC로 보내지 못했습니다.');
      }
      return;
    }

    setIsPlaying(false);
    setStatus(message.type === 'finished' ? '곡이 끝났습니다.' : '일시 정지했습니다.');
    if (settings) {
      try {
        await sendPlayback(settings, null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Discord 상태를 지우지 못했습니다.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SOUNDCLOUD × DISCORD</Text>
            <Text style={styles.title}>DisCloud</Text>
          </View>
          <View style={[styles.statusDot, isPlaying && styles.statusDotPlaying]} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PC 중계 앱 연결</Text>
          <Text style={styles.hint}>
            PC와 휴대폰을 같은 Wi-Fi에 연결한 뒤, PC 중계 앱에 표시된 주소와 연결 코드를 입력하세요.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setRelayUrl}
            placeholder="http://192.168.0.10:3737"
            placeholderTextColor="#78818d"
            style={styles.input}
            value={relayUrl}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPairingToken}
            placeholder="PC 중계 앱 연결 코드"
            placeholderTextColor="#78818d"
            secureTextEntry
            style={styles.input}
            value={pairingToken}
          />
          <Pressable
            accessibilityRole="button"
            disabled={isPairing}
            onPress={connectRelay}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isPairing && styles.disabled]}
          >
            {isPairing ? <ActivityIndicator color="#101216" /> : <Text style={styles.primaryButtonText}>연결 확인</Text>}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SoundCloud 재생</Text>
          <Text style={styles.hint}>공개 트랙 또는 플레이리스트 링크를 입력해 앱 안에서 재생하세요.</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setTrackUrl}
            onSubmitEditing={loadTrack}
            placeholder="https://soundcloud.com/artist/track"
            placeholderTextColor="#78818d"
            returnKeyType="go"
            style={styles.input}
            value={trackUrl}
          />
          <Pressable
            accessibilityRole="button"
            onPress={loadTrack}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>플레이어 열기</Text>
          </Pressable>
        </View>

        <View style={styles.nowPlaying}>
          <Text style={styles.nowPlayingLabel}>현재 상태</Text>
          <Text style={styles.statusText}>{status}</Text>
          {track && (
            <Text numberOfLines={2} style={styles.trackText}>
              {track.title} · {track.artist}
            </Text>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {playerUrl ? (
          <View style={styles.player}>
            <WebView<WebViewProps>
              allowsInlineMediaPlayback
              javaScriptEnabled
              mediaPlaybackRequiresUserAction
              onMessage={handlePlayerMessage}
              originWhitelist={['*']}
              source={{ html: buildSoundCloudPlayer(playerUrl), baseUrl: 'https://soundcloud.com' }}
              style={styles.webView}
            />
          </View>
        ) : (
          <View style={styles.emptyPlayer}>
            <Text style={styles.emptyIcon}>♫</Text>
            <Text style={styles.emptyTitle}>SoundCloud 링크로 시작하세요</Text>
            <Text style={styles.hint}>재생 정보는 같은 Wi-Fi의 PC를 통해 Discord Rich Presence로 전달됩니다.</Text>
          </View>
        )}

        <Text style={styles.footer}>Discord 프로필의 활동 공유를 켜 두어야 Rich Presence가 보입니다.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function isRelaySettings(value: unknown): value is RelaySettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<RelaySettings>;
  return typeof settings.url === 'string' && typeof settings.token === 'string';
}

function parsePlayerMessage(value: string): PlayerMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(value);
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;

  const candidate = message as Record<string, unknown>;
  if (candidate.type === 'paused' || candidate.type === 'finished') return { type: candidate.type };
  if (candidate.type === 'error' && typeof candidate.message === 'string') {
    return { type: 'error', message: candidate.message.slice(0, 256) };
  }
  if (candidate.type !== 'playing' || !candidate.track || typeof candidate.track !== 'object') return null;

  const track = candidate.track as Record<string, unknown>;
  if (
    typeof track.title !== 'string' ||
    typeof track.artist !== 'string' ||
    typeof track.permalinkUrl !== 'string' ||
    typeof track.durationMs !== 'number' ||
    typeof candidate.positionMs !== 'number' ||
    !Number.isFinite(track.durationMs) ||
    !Number.isFinite(candidate.positionMs)
  ) {
    return null;
  }

  return {
    type: 'playing',
    track: {
      title: track.title.slice(0, 128),
      artist: track.artist.slice(0, 128),
      permalinkUrl: track.permalinkUrl.slice(0, 2048),
      durationMs: track.durationMs,
    },
    positionMs: candidate.positionMs,
  };
}

function parseSoundCloudUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    const allowedHosts = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com']);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) return null;
    if (parsed.hostname.toLowerCase() !== 'on.soundcloud.com' && parsed.pathname.split('/').filter(Boolean).length < 2) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#111318' },
  content: { padding: 20, paddingBottom: 36, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  eyebrow: { color: '#ff6b35', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#f5f7fa', fontSize: 32, fontWeight: '800', marginTop: 4 },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#59616d' },
  statusDotPlaying: { backgroundColor: '#ff6b35' },
  card: { backgroundColor: '#1b1f26', borderColor: '#282e38', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { color: '#f5f7fa', fontSize: 17, fontWeight: '700' },
  hint: { color: '#a5adb8', fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: '#12151a',
    borderColor: '#343b46',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f5f7fa',
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  primaryButton: { backgroundColor: '#ff6b35', minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#111318', fontSize: 15, fontWeight: '800' },
  secondaryButton: { backgroundColor: '#292f38', minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#f5f7fa', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  nowPlaying: { paddingHorizontal: 4, gap: 5 },
  nowPlayingLabel: { color: '#7f8996', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  statusText: { color: '#d8dde4', fontSize: 14, lineHeight: 20 },
  trackText: { color: '#ff9a70', fontSize: 14, fontWeight: '700', marginTop: 2 },
  errorText: { color: '#ff8b8b', fontSize: 13, lineHeight: 19, marginTop: 3 },
  player: { overflow: 'hidden', borderRadius: 12, minHeight: 270, backgroundColor: '#1b1f26' },
  webView: { backgroundColor: '#1b1f26', height: 270 },
  emptyPlayer: {
    minHeight: 190,
    borderColor: '#282e38',
    borderWidth: 1,
    borderRadius: 16,
    padding: 22,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#171a20',
  },
  emptyIcon: { color: '#ff6b35', fontSize: 38 },
  emptyTitle: { color: '#f5f7fa', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  footer: { color: '#7f8996', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
