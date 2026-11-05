# DisCloud

DisCloud is an Android/iOS SoundCloud player that sends the currently playing public track to a small PC companion. The companion talks to the running Discord desktop app and updates the user's Rich Presence.

## What it does

- Plays a public SoundCloud track or playlist inside the mobile app using SoundCloud's official embedded player and Widget API.
- Sends track, artist, and playback timing to a paired PC on the same Wi-Fi.
- Uses the PC companion to update and clear Discord Rich Presence through Discord's local RPC connection.
- Keeps the pairing code on the phone in the platform's secure storage.

SoundCloud's public API does not expose a user's live playback state. This first version therefore observes playback from the embedded SoundCloud player; it does not detect music played in SoundCloud's separate mobile app. The mobile app also cannot set Rich Presence directly in Discord mobile, so the PC companion and Discord desktop must be running.

## PC companion setup

1. Create a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications) and copy its Application ID.
2. Install Node.js 20 or later, then install the relay dependencies:

   ```powershell
   cd relay
   npm install
   ```

3. Keep the Discord desktop app running and start the relay in PowerShell:

   ```powershell
   $env:DISCORD_CLIENT_ID = "YOUR_DISCORD_APPLICATION_ID"
   npm start
   ```

4. Allow the relay through Windows Firewall on a trusted private network if prompted. The relay prints one or more local addresses and a random pairing code.
5. In DisCloud, enter the PC address and pairing code, then press **연결 확인**. The phone and PC must be on the same Wi-Fi and the access point must allow devices to communicate with each other.
6. Paste a public SoundCloud track or playlist URL, open the player, and press play. Enable activity sharing in Discord to show the presence on your profile.

The relay binds to the local network and requires a random bearer token for pairing and playback updates. Use it only on a trusted private network and do not share the pairing code. The relay saves the code under the current user's home directory (`~/.discloud/relay-token`) so the phone stays paired after restarts; remove that file to rotate the code.

## Mobile development

The app uses Expo and React Native. With Node.js installed:

```powershell
cd mobile
npm install
npx expo start
```

For Android/iOS native builds, use an Expo development build or EAS Build. An iOS binary must be built and signed with Apple's toolchain; this Windows workspace cannot produce an iOS App Store build locally.

## Current limitations

- Only public SoundCloud embeds are supported; no SoundCloud account login or private tracks.
- Playback runs inside the DisCloud app. Audio/background behavior depends on SoundCloud's embedded player and the mobile OS.
- Discord Rich Presence is sent by the PC companion to the local Discord desktop client; it is not written directly to Discord's servers.
- A relay hosted in Termux is not automatically public. It is reachable only from devices that can access that Android device over the network, and it cannot use Discord desktop's local RPC unless Discord desktop runs on that same computer. Remote access for other networks would require a separately hosted service and additional security work.
