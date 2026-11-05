import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { Client } from '@xhayper/discord-rpc';

import { createDiscordPresence } from './discord-presence.mjs';
import { createRelayServer } from './server.mjs';

const clientId = process.env.DISCORD_CLIENT_ID;
if (!/^\d{17,20}$/.test(clientId ?? '')) {
  console.error('Set DISCORD_CLIENT_ID to the Application ID from the Discord Developer Portal.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3737);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const token = await loadPairingToken();
const client = new Client({ clientId });
let relayServer;

client.on('ready', () => {
  if (relayServer) return;
  relayServer = createRelayServer({ token, presence: createDiscordPresence(client) });
  relayServer.listen(port, '0.0.0.0', () => {
    console.log(`Discord is connected. Pair your phone with:`);
    for (const address of localIPv4Addresses()) {
      console.log(`  http://${address}:${port}`);
    }
    console.log(`Pairing code: ${token}`);
    console.log('Keep this code private and use a trusted Wi-Fi network.');
  });
  relayServer.on('error', (error) => {
    console.error(`Relay server failed: ${error.message}`);
    process.exitCode = 1;
  });
});

client.on('disconnected', () => {
  console.error('Discord disconnected. Restart the relay after Discord is available again.');
});

client.login().catch((error) => {
  console.error(`Could not connect to Discord desktop: ${error.message}`);
  process.exitCode = 1;
});

function localIPv4Addresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal && isPrivateIPv4(entry.address))
    .map((entry) => entry.address);
}

function isPrivateIPv4(address) {
  const [first, second] = address.split('.').map(Number);
  return (
    first === 10 ||
    first === 192 && second === 168 ||
    first === 172 && second >= 16 && second <= 31
  );
}

async function loadPairingToken() {
  const override = process.env.DISCLOUD_PAIRING_TOKEN;
  if (override) {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(override)) {
      throw new Error('DISCLOUD_PAIRING_TOKEN must contain 32-128 URL-safe characters.');
    }
    return override;
  }

  const directory = join(homedir(), '.discloud');
  const tokenPath = join(directory, 'relay-token');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const saved = (await readFile(tokenPath, 'utf8')).trim();
    if (/^[A-Za-z0-9_-]{32,128}$/.test(saved)) return saved;
    throw new Error(`The pairing token in ${tokenPath} is invalid; remove it to create a new one.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const token = randomBytes(24).toString('base64url');
  try {
    await writeFile(tokenPath, token, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return token;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return (await readFile(tokenPath, 'utf8')).trim();
  }
}
