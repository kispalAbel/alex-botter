# Minecraft Local IP Rotation Tester

This branch tests parallel Minecraft connections from multiple local source addresses assigned on the same machine.

Use it only on localhost or on servers you own and control.

## Current branch behavior

This `feature/local-ip-rotation` branch uses:

- `mineflayer` for the Minecraft client layer
- `minecraft-protocol` only for the initial status ping
- a `localAddresses` list from `config.json`
- round-robin local source IP selection per client connection

The point of this branch is validating that multiple fake players can stay online at the same time while each new connection binds to a different local address.

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

- [bot.js](/d:/GitHub/alex-botter/bot.js): main script and local-address rotation logic
- `config.json`: local configuration for host, auth commands, and source IP list
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
  "localAddresses": ["127.0.0.2", "127.0.0.3", "127.0.0.4"],
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

## Important limits

- This branch does not use external proxies.
- It only helps when the machine can actually bind and route multiple usable source addresses.
- It still uses `mineflayer`, so it is heavier than the later proxy branch with the lean client.
- It is best suited for localhost or controlled-network experiments.
