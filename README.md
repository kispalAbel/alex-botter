# Minecraft Single-IP Burst Tester

This branch is the baseline version of the project: multiple fake players from the same machine, using the machine's default outbound IP.

Use it only on localhost or on servers you own and control.

## Current branch behavior

This `main` branch uses:

- `mineflayer` for Minecraft client handling
- `minecraft-protocol` for the initial server ping
- one normal outbound network path from the host machine
- no local source-IP rotation
- no proxy rotation

It is the simplest branch and acts as the baseline before the later local-IP and proxy experiments.

## Flow

1. Ping the target server.
2. Load saved credentials from the configured accounts file.
3. Reuse saved accounts first.
4. If a saved account needs `/login`, send it.
5. If a saved account needs `/register`, try registering it again with the stored password.
6. If a saved account is bound to another password, remove it from the saved accounts file.
7. When saved accounts run out, generate new credentials.
8. Register new accounts, then log them in.
9. Keep successful clients online and continue until `targetOnlineBots` is reached.
10. If a disconnect wave crosses the configured threshold, treat the run as a success and stop.

If the server sends a resource-pack request, the bot accepts it without downloading it.

## Files

- [bot.js](/d:/GitHub/alex-botter/bot.js): main script and baseline connection logic
- `config.json`: local configuration
- `stored_bots.json` or your configured accounts file: saved generated credentials

## Usage

1. Install Node.js.
2. Install dependencies:

```bash
npm install
```

3. Edit `config.json`.
4. Start the tester:

```bash
npm start
```

## Config shape

Example:

```json
{
  "host": "localhost",
  "port": 25565,
  "version": false,
  "targetOnlineBots": 10,
  "retryCount": 3,
  "retryDelayMs": 2000,
  "probeTimeoutMs": 5000,
  "connectTimeoutMs": 15000,
  "readyTimeoutMs": 15000,
  "authTimeoutMs": 15000,
  "nextBotDelayMs": 1000,
  "commandDelayMs": 700,
  "disconnectWaveWindowMs": 5000,
  "disconnectWaveMinCount": 5,
  "disconnectWaveRatio": 0.5,
  "fullyRandomNames": false,
  "startWith": "bot_",
  "usernameLength": 12,
  "passwordLength": 12,
  "accountsFile": "stored_bots.json",
  "registerCommand": "/register {password} {password}",
  "loginCommand": "/login {password}"
}
```

## Important limits

- Every connection leaves the host through the same default outbound IP.
- This branch is heavier than the later lean-client proxy branch because it still uses `mineflayer`.
- It is useful as a baseline comparison against the other branches.
