# Minecraft Proxy Rotation Tester

This project drives multiple lightweight Minecraft clients through a list of HTTP proxies to validate how your own server behaves under parallel connections.

Use it only on localhost or on servers you own and control.

## Current branch behavior

This `feature/proxy-rotation` branch uses:

- a shared `proxyAuth` username and password from `config.json`
- a `proxies` list of concrete HTTP proxy endpoints
- round-robin proxy assignment per generated client
- a lean protocol client in [lean-bot.js](/d:/GitHub/alex-botter/lean-bot.js), not `mineflayer`
- file logging in the local `logs/` directory via [logger.js](/d:/GitHub/alex-botter/logger.js)

The main orchestration stays in [bot.js](/d:/GitHub/alex-botter/bot.js).

## Flow

1. Ping the target server.
2. Load saved credentials from the configured accounts file.
3. Reuse saved accounts first.
4. If a saved account needs `/login`, send it.
5. If a saved account suddenly needs `/register`, try registering it again with the stored password.
6. If a saved account is clearly bound to another password, remove it from the saved accounts file.
7. When saved accounts run out, generate new credentials.
8. Register new accounts, then log them in.
9. Keep successful clients online and continue until `targetOnlineBots` is reached.
10. If a disconnect wave crosses the configured threshold, treat the run as a success and stop.

If the server requests a resource pack, the client acknowledges it without downloading it.

## Files

- [bot.js](/d:/GitHub/alex-botter/bot.js): main runner, retry logic, auth flow, proxy assignment
- [lean-bot.js](/d:/GitHub/alex-botter/lean-bot.js): minimal Minecraft client wrapper built on `minecraft-protocol`
- [logger.js](/d:/GitHub/alex-botter/logger.js): console + file logger
- `config.json`: local runtime config, intentionally ignored by Git on this branch
- `stored_bots.json` or your configured accounts file: saved generated credentials
- `logs/`: per-run log files

## Usage

1. Install Node.js.
2. Install dependencies:

```bash
npm install
```

3. Create or edit your local `config.json`.
4. Start the tester:

```bash
npm start
```

## Config shape

The current branch expects a local `config.json` with this structure:

```json
{
  "proxyAuth": {
    "username": "YOUR_PROXY_USERNAME",
    "password": "YOUR_PROXY_PASSWORD"
  },
  "proxies": [
    {
      "type": "http",
      "host": "31.59.20.176",
      "port": 6754
    }
  ],
  "host": "localhost",
  "port": 25565,
  "version": false,
  "targetOnlineBots": 10,
  "retryCount": 3,
  "retryDelayMs": 5000,
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
  "startWith": "backuper_",
  "usernameLength": 12,
  "passwordLength": 12,
  "accountsFile": "stored_bots.json",
  "registerCommand": "/register {password} {password}",
  "loginCommand": "/login {password}"
}
```

If top-level config keys are missing, [bot.js](/d:/GitHub/alex-botter/bot.js) writes default values back into `config.json`.

## Important limits

- This branch reduces client-side overhead by removing `mineflayer`, but it cannot stop bandwidth that the server already sends.
- Real bandwidth savings still depend mostly on server-side packet reduction.
- These proxies are treated as concrete HTTP CONNECT endpoints, one client per selected endpoint.

## Logging

Every run creates a log file under `logs/` named like:

```text
logs/run-2026-04-03T12-34-56-789Z.log
```

The console output is mirrored into that file, including uncaught exceptions and unhandled promise rejections.
