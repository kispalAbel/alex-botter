# Minecraft IP Burst Tester

This project is for validating a Minecraft server's anti-bot or IP rate-limit behavior from a single source IP.

Use it only on localhost or servers you own and control.

The flow is:

1. Ping the server first.
2. If there are saved accounts in the local JSON file, try those first.
3. For saved accounts, connect and send `/login`.
4. If the server says the account must be registered first, send `/register` with the same stored password.
5. If the server says the saved account is registered with another password, remove that account from the JSON file.
6. After saved accounts are exhausted, generate a random username and password for new registrations.
7. If a new registration succeeds, save the username and password in the local JSON file.
8. If login succeeds, keep the bot online and move on to the next account.
9. If more than 50 percent of the already-online bots are disconnected within 5 seconds, and that count is at least 5, treat the test as successful, clear the accounts file, log success, and stop.

If the server sends a resource-pack request, the bot reports it as accepted and loaded without actually downloading it.

## Usage

1. Install Node.js on the machine.
2. Install dependencies:

```bash
npm install
```

3. Edit [config.json](/d:/GitHub/alex-botter/config.json).
4. Start the tester:

```bash
npm start
```

## Main config fields

- `host`: server domain or IP
- `port`: Minecraft port
- `version`: leave `false` for auto-detect unless you need a fixed version
- `targetOnlineBots`: target number of online bots to keep connected, default `50`
- `retryCount`: retry count per generated account
- `retryDelayMs`: delay before retrying the same account
- `probeTimeoutMs`: status ping timeout before the run starts
- `connectTimeoutMs`: connection timeout
- `readyTimeoutMs`: time allowed to reach login or spawn before auth starts
- `authTimeoutMs`: time allowed for register/login chat responses
- `nextBotDelayMs`: delay before starting the next generated account
- `commandDelayMs`: small delay before sending auth commands
- `disconnectWaveWindowMs`: rolling window for anti-bot success detection
- `disconnectWaveMinCount`: minimum disconnect count required for success
- `disconnectWaveRatio`: disconnect ratio threshold, default `0.5`
- `fullyRandomNames`: if `true`, names are fully random
- `startWith`: prefix used when `fullyRandomNames` is `false`
- `usernameLength`: generated username length, max 16
- `passwordLength`: generated password length
- `accountsFile`: local JSON file that stores the generated credentials

## Auth behavior

By default the script uses:

- `registerCommand`
- `loginCommand`

It also watches chat messages for:

- register success
- login success
- login prompt
- register prompt
- already registered responses
- wrong password responses
- register-first responses

Those patterns can be customized in `config.json` if your auth plugin uses different text.

## Saved credentials

Successful registrations are written without hashing to the JSON file defined by `accountsFile`.

Example config:

```json
{
  "targetOnlineBots": 10,
  "retryCount": 3,
  "accountsFile": "registered_accounts.json",
  "registerCommand": "/register {password} {password}",
  "loginCommand": "/login {password}"
}
```
