const mineflayer = require('mineflayer')
const minecraftProtocol = require('minecraft-protocol')
const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, 'config.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Hiba: config.json nem talalhato.')
    process.exit(1)
  }

  let config
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (error) {
    console.error('Hiba: a config.json nem ervenyes JSON.')
    process.exit(1)
  }

  if (!config.host || typeof config.host !== 'string') {
    console.error('Hiba: a config.json "host" mezoje kotelezo.')
    process.exit(1)
  }

  return {
    host: config.host,
    port: Number(config.port ?? 25565),
    version: config.version ?? false,
    targetOnlineBots: Number(config.targetOnlineBots ?? 10),
    retryCount: Number(config.retryCount ?? 4),
    retryDelayMs: Number(config.retryDelayMs ?? 2000),
    probeTimeoutMs: Number(config.probeTimeoutMs ?? 5000),
    connectTimeoutMs: Number(config.connectTimeoutMs ?? 15000),
    readyTimeoutMs: Number(config.readyTimeoutMs ?? 15000),
    authTimeoutMs: Number(config.authTimeoutMs ?? 15000),
    nextBotDelayMs: Number(config.nextBotDelayMs ?? 1000),
    commandDelayMs: Number(config.commandDelayMs ?? 700),
    usernamePrefix: String(config.usernamePrefix ?? 'probe'),
    usernameLength: Number(config.usernameLength ?? 12),
    passwordLength: Number(config.passwordLength ?? 12),
    accountsFile: String(config.accountsFile ?? 'stored_bots.json'),
    registerCommand: String(config.registerCommand ?? '/register {password} {password}'),
    loginCommand: String(config.loginCommand ?? '/login {password}'),
    disconnectWaveWindowMs: Number(config.disconnectWaveWindowMs ?? 5000),
    disconnectWaveMinCount: Number(config.disconnectWaveMinCount ?? 5),
    disconnectWaveRatio: Number(config.disconnectWaveRatio ?? 0.5),
    registerPromptPatterns: config.registerPromptPatterns ?? [
      '/register',
      'please register',
      'register to continue',
      'regisztralj',
      'regisztracio',
      'elobb regisztralj',
      'register first'
    ],
    registerSuccessPatterns: config.registerSuccessPatterns ?? [
      'successfully registered',
      'registered successfully',
      'sikeresen regisztralt',
      'sikeres regisztracio'
    ],
    loginPromptPatterns: config.loginPromptPatterns ?? [
      '/login',
      'please login',
      'login to continue',
      'jelentkezz be',
      'bejelentkezes'
    ],
    loginSuccessPatterns: config.loginSuccessPatterns ?? [
      'successfully logged in',
      'logged in successfully',
      'successful login',
      'sikeresen bejelentkeztel',
      'sikeres bejelentkezes',
      'sikeresen beleptel'
    ],
    alreadyRegisteredPatterns: config.alreadyRegisteredPatterns ?? [
      'already registered',
      'account already exists',
      'mar regisztralt',
      'mar letezik'
    ],
    invalidPasswordPatterns: config.invalidPasswordPatterns ?? [
      'wrong password',
      'incorrect password',
      'invalid password',
      'hibas jelszo',
      'rossz jelszo',
      'masik jelszoval',
      'another password'
    ],
    needsRegisterPatterns: config.needsRegisterPatterns ?? [
      'register first',
      'please register first',
      'elobb regisztralj',
      'elobb regisztralnod kell'
    ],
    alreadyLoggedInPatterns: config.alreadyLoggedInPatterns ?? [
      'already logged in',
      'already authenticated',
      'mar be vagy jelentkezve',
      'mar hitelesitve vagy'
    ]
  }
}

function validateConfig(config) {
  const numericFields = [
    'port',
    'targetOnlineBots',
    'retryCount',
    'retryDelayMs',
    'probeTimeoutMs',
    'connectTimeoutMs',
    'readyTimeoutMs',
    'authTimeoutMs',
    'nextBotDelayMs',
    'commandDelayMs',
    'usernameLength',
    'passwordLength',
    'disconnectWaveWindowMs',
    'disconnectWaveMinCount',
    'disconnectWaveRatio'
  ]

  for (const field of numericFields) {
    if (!Number.isFinite(config[field]) || config[field] < 0) {
      console.error(`Hiba: ervenytelen szam mezo: ${field}`)
      process.exit(1)
    }
  }

  if (config.targetOnlineBots < 1) {
    console.error('Hiba: a targetOnlineBots legalabb 1 legyen.')
    process.exit(1)
  }

  if (config.usernameLength < 3 || config.usernameLength > 16) {
    console.error('Hiba: a usernameLength 3 es 16 kozott legyen.')
    process.exit(1)
  }

  if (config.passwordLength < 4) {
    console.error('Hiba: a passwordLength legalabb 4 legyen.')
    process.exit(1)
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesAnyPattern(message, patterns) {
  const normalizedMessage = normalizeText(message)
  return patterns.some((pattern) => normalizedMessage.includes(normalizeText(pattern)))
}

function randomString(length, chars) {
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)]
  }
  return output
}

function buildUsername(index, config) {
  const safePrefix = config.usernamePrefix.replace(/[^A-Za-z0-9_]/g, '').slice(0, 10) || 'probe'
  const indexPart = String(index)
  const base = `${safePrefix}${indexPart}`
  const randomLength = Math.max(1, config.usernameLength - base.length)
  const trimmedBase = base.slice(0, Math.max(1, config.usernameLength - randomLength))
  const suffix = randomString(randomLength, 'abcdefghijklmnopqrstuvwxyz0123456789_')
  return `${trimmedBase}${suffix}`.slice(0, 16)
}

function buildPassword(config) {
  return randomString(config.passwordLength, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
}

function formatReason(reason) {
  if (!reason) {
    return 'n/a'
  }

  if (typeof reason === 'string') {
    return reason
  }

  try {
    return JSON.stringify(reason)
  } catch (error) {
    return String(reason)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function preflightPing(config) {
  console.log(`Preflight ping: ${config.host}:${config.port}`)
  const response = await minecraftProtocol.ping({
    host: config.host,
    port: config.port,
    version: config.version || undefined,
    closeTimeout: config.probeTimeoutMs,
    noPongTimeout: config.probeTimeoutMs,
    connect: () => {}
  })

  const versionText = response?.version?.name ? ` version=${response.version.name}` : ''
  const playersText = response?.players ? ` players=${response.players.online}/${response.players.max}` : ''
  const latencyText = Number.isFinite(response?.latency) ? ` latency=${response.latency}ms` : ''
  console.log(`Ping OK.${versionText}${playersText}${latencyText}`)
}

function loadAccounts(filePath) {
  if (!fs.existsSync(filePath)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((entry) => entry && typeof entry.username === 'string' && typeof entry.password === 'string')
      .map((entry) => ({
        username: entry.username,
        password: entry.password
      }))
  } catch (error) {
    console.log(`Figyelem: nem tudtam beolvasni az account fajlt: ${error.message}`)
    return []
  }
}

function persistAccounts(filePath, accounts) {
  fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2))
}

const config = loadConfig()
validateConfig(config)

const ACCOUNTS_PATH = path.join(__dirname, config.accountsFile)
const accounts = loadAccounts(ACCOUNTS_PATH)
const savedQueue = accounts.map((entry) => ({ ...entry }))
const activeBots = new Set()
const onlineBots = new Map()
const disconnectEvents = []

const stats = {
  launchAttempts: 0,
  retries: 0,
  registerSuccess: 0,
  loginSuccess: 0,
  kicked: 0,
  errors: 0,
  ended: 0,
  removedAccounts: 0,
  generatedAccounts: 0,
  successfulDisconnectWaves: 0
}

let highestOnlineCount = 0
let launchPhaseFinished = false
let launchStoppedByFailure = false
let shuttingDown = false
let successTriggered = false

function upsertAccount(credentials) {
  const index = accounts.findIndex((entry) => entry.username === credentials.username)
  const nextEntry = {
    username: credentials.username,
    password: credentials.password
  }

  if (index === -1) {
    accounts.push(nextEntry)
  } else {
    accounts[index] = nextEntry
  }

  persistAccounts(ACCOUNTS_PATH, accounts)
}

function removeAccount(username, reason) {
  const index = accounts.findIndex((entry) => entry.username === username)
  if (index === -1) {
    return false
  }

  accounts.splice(index, 1)
  persistAccounts(ACCOUNTS_PATH, accounts)
  stats.removedAccounts += 1
  console.log(`[${username}] removed from accounts file (${reason})`)
  return true
}

function clearAccounts(reason) {
  accounts.length = 0
  persistAccounts(ACCOUNTS_PATH, accounts)
  console.log(`Accounts file cleared (${reason})`)
}

function printSummary() {
  console.log('')
  console.log('=== SUMMARY ===')
  console.log(`launchAttempts:          ${stats.launchAttempts}`)
  console.log(`retries:                 ${stats.retries}`)
  console.log(`registerSuccess:         ${stats.registerSuccess}`)
  console.log(`loginSuccess:            ${stats.loginSuccess}`)
  console.log(`generatedAccounts:       ${stats.generatedAccounts}`)
  console.log(`removedAccounts:         ${stats.removedAccounts}`)
  console.log(`onlineBots:              ${onlineBots.size}`)
  console.log(`highestOnlineCount:      ${highestOnlineCount}`)
  console.log(`kicked:                  ${stats.kicked}`)
  console.log(`ended:                   ${stats.ended}`)
  console.log(`errors:                  ${stats.errors}`)
  console.log(`successfulDisconnectWaves: ${stats.successfulDisconnectWaves}`)
}

function maybeExit() {
  if (!launchPhaseFinished) {
    return
  }

  if (onlineBots.size > 0) {
    return
  }

  if (activeBots.size > 0) {
    return
  }

  printSummary()
  process.exit(successTriggered ? 0 : (launchStoppedByFailure ? 1 : 0))
}

function closeBot(bot, reason) {
  try {
    bot.quit(reason)
  } catch (error) {
    try {
      bot.end(reason)
    } catch (innerError) {
      // Ignore close errors.
    }
  }
}

function shutdown(signal) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  launchPhaseFinished = true
  launchStoppedByFailure = true

  console.log(`\nReceived ${signal}, closing ${activeBots.size} bot(s)...`)
  for (const bot of activeBots) {
    closeBot(bot, `shutdown:${signal}`)
  }

  setTimeout(() => {
    printSummary()
    process.exit(1)
  }, 500)
}

function recordDisconnectWave() {
  const now = Date.now()
  disconnectEvents.push(now)

  while (disconnectEvents.length > 0 && now - disconnectEvents[0] > config.disconnectWaveWindowMs) {
    disconnectEvents.shift()
  }

  const disconnectedCount = disconnectEvents.length
  const threshold = Math.floor(highestOnlineCount * config.disconnectWaveRatio)
  const exceedsRatio = disconnectedCount > threshold
  const exceedsMinimum = disconnectedCount >= config.disconnectWaveMinCount

  if (!successTriggered && exceedsRatio && exceedsMinimum) {
    successTriggered = true
    stats.successfulDisconnectWaves += 1
    launchPhaseFinished = true
    clearAccounts('disconnect wave detected')
    console.log(
      `Success: ${disconnectedCount} bot disconnect(s) detected within ${config.disconnectWaveWindowMs}ms, which is above 50% of the online peak (${highestOnlineCount}).`
    )

    for (const bot of activeBots) {
      closeBot(bot, 'success-stop')
    }
    maybeExit()
  }
}

function classifyAuthMessage(message) {
  if (matchesAnyPattern(message, config.invalidPasswordPatterns)) {
    return 'invalid_password'
  }

  if (matchesAnyPattern(message, config.needsRegisterPatterns)) {
    return 'needs_register'
  }

  if (matchesAnyPattern(message, config.registerSuccessPatterns)) {
    return 'register_success'
  }

  if (matchesAnyPattern(message, config.loginSuccessPatterns)) {
    return 'login_success'
  }

  if (matchesAnyPattern(message, config.alreadyLoggedInPatterns)) {
    return 'login_success'
  }

  if (matchesAnyPattern(message, config.alreadyRegisteredPatterns)) {
    return 'already_registered'
  }

  if (matchesAnyPattern(message, config.loginPromptPatterns)) {
    return 'login_prompt'
  }

  if (matchesAnyPattern(message, config.registerPromptPatterns)) {
    return 'register_prompt'
  }

  return null
}

function waitForSignal(bot, timeoutMs, options = {}) {
  const { includeSpawn = false, includeLogin = false } = options

  return new Promise((resolve) => {
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      bot.off('messagestr', onMessage)
      bot.off('spawn', onSpawn)
      bot.off('login', onLogin)
      bot.off('kicked', onKicked)
      bot.off('error', onError)
      bot.off('end', onEnd)
    }

    const done = (value) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(value)
    }

    const timer = setTimeout(() => done({ type: 'timeout' }), timeoutMs)

    const onMessage = (message) => {
      const authType = classifyAuthMessage(message)
      if (authType) {
        done({ type: authType, message })
      }
    }

    const onSpawn = () => {
      if (includeSpawn) {
        done({ type: 'spawn' })
      }
    }

    const onLogin = () => {
      if (includeLogin) {
        done({ type: 'login' })
      }
    }

    const onKicked = (reason) => done({ type: 'kicked', reason: formatReason(reason) })
    const onError = (error) => done({ type: 'error', error })
    const onEnd = (reason) => done({ type: 'end', reason: formatReason(reason) })

    bot.on('messagestr', onMessage)
    bot.on('spawn', onSpawn)
    bot.on('login', onLogin)
    bot.on('kicked', onKicked)
    bot.on('error', onError)
    bot.on('end', onEnd)
  })
}

function renderCommand(template, credentials) {
  return template
    .split('{username}').join(credentials.username)
    .split('{password}').join(credentials.password)
}

function attachPersistentLogging(bot, credentials) {
  bot.on('login', () => {
    console.log(`[${credentials.username}] protocol login`)
  })

  bot.on('spawn', () => {
    console.log(`[${credentials.username}] spawn`)
  })

  bot.on('messagestr', (message) => {
    const authType = classifyAuthMessage(message)
    if (authType) {
      console.log(`[${credentials.username}] chat(${authType}): ${message}`)
    }
  })

  bot.on('resourcePack', () => {
    try {
      bot.acceptResourcePack()
      console.log(`[${credentials.username}] resource pack accepted without download`)
    } catch (error) {
      console.log(`[${credentials.username}] resource pack accept failed: ${error.message}`)
    }
  })

  bot.on('kicked', (reason) => {
    stats.kicked += 1
    console.log(`[${credentials.username}] kicked: ${formatReason(reason)}`)
  })

  bot.on('error', (error) => {
    stats.errors += 1
    console.log(`[${credentials.username}] error: ${error.message}`)
  })

  bot.on('end', (reason) => {
    stats.ended += 1
    activeBots.delete(bot)

    if (onlineBots.has(credentials.username)) {
      onlineBots.delete(credentials.username)
      recordDisconnectWave()
    }

    console.log(`[${credentials.username}] end: ${formatReason(reason)}`)
    maybeExit()
  })
}

async function finishLogin(bot, credentials) {
  await sleep(config.commandDelayMs)
  console.log(`[${credentials.username}] sending login command`)
  bot.chat(renderCommand(config.loginCommand, credentials))

  const loginResult = await waitForSignal(bot, config.authTimeoutMs)
  if (loginResult.type === 'login_success') {
    return { ok: true }
  }

  return { ok: false, result: loginResult }
}

async function runSavedAccountFlow(bot, credentials) {
  await sleep(config.commandDelayMs)
  console.log(`[${credentials.username}] saved account, sending login command`)
  bot.chat(renderCommand(config.loginCommand, credentials))

  const firstResult = await waitForSignal(bot, config.authTimeoutMs)
  if (firstResult.type === 'login_success') {
    return { ok: true }
  }

  if (firstResult.type === 'needs_register' || firstResult.type === 'register_prompt') {
    await sleep(config.commandDelayMs)
    console.log(`[${credentials.username}] saved account needs registration, sending register command`)
    bot.chat(renderCommand(config.registerCommand, credentials))

    const registerResult = await waitForSignal(bot, config.authTimeoutMs)
    if (registerResult.type === 'register_success') {
      stats.registerSuccess += 1
      upsertAccount(credentials)
      return finishLogin(bot, credentials)
    }

    return { ok: false, result: registerResult, removeAccount: false }
  }

  if (firstResult.type === 'invalid_password' || firstResult.type === 'already_registered') {
    return { ok: false, result: firstResult, removeAccount: true }
  }

  return { ok: false, result: firstResult, removeAccount: false }
}

async function runNewAccountFlow(bot, credentials) {
  await sleep(config.commandDelayMs)
  console.log(`[${credentials.username}] new account, sending register command`)
  bot.chat(renderCommand(config.registerCommand, credentials))

  const registerResult = await waitForSignal(bot, config.authTimeoutMs)
  if (registerResult.type === 'register_success') {
    stats.registerSuccess += 1
    upsertAccount(credentials)
    return finishLogin(bot, credentials)
  }

  if (registerResult.type === 'already_registered') {
    return { ok: false, result: registerResult, removeAccount: false, usernameCollision: true }
  }

  if (registerResult.type === 'login_success') {
    upsertAccount(credentials)
    return { ok: true }
  }

  return { ok: false, result: registerResult, removeAccount: false }
}

async function attemptBot(candidate, attemptNumber) {
  const credentials = {
    username: candidate.username,
    password: candidate.password
  }

  stats.launchAttempts += 1
  console.log(`[${credentials.username}] attempt ${attemptNumber + 1}/${config.retryCount + 1} (${candidate.source})`)

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: credentials.username,
    version: config.version,
    connectTimeout: config.connectTimeoutMs
  })

  activeBots.add(bot)
  attachPersistentLogging(bot, credentials)

  const readyResult = await waitForSignal(bot, config.readyTimeoutMs, {
    includeSpawn: true,
    includeLogin: true
  })

  if (readyResult.type === 'kicked' || readyResult.type === 'error' || readyResult.type === 'end' || readyResult.type === 'timeout') {
    if (readyResult.type === 'timeout') {
      closeBot(bot, 'ready-timeout')
    }
    return { ok: false, retryable: true, result: readyResult, credentials }
  }

  const authResult = candidate.source === 'saved'
    ? await runSavedAccountFlow(bot, credentials)
    : await runNewAccountFlow(bot, credentials)

  if (!authResult.ok) {
    if (authResult.removeAccount) {
      removeAccount(credentials.username, authResult.result?.type || 'invalid_saved_account')
    }
    closeBot(bot, `auth-failed:${authResult.result?.type || 'unknown'}`)
    return {
      ok: false,
      retryable: !authResult.removeAccount,
      result: authResult.result,
      credentials,
      usernameCollision: authResult.usernameCollision === true
    }
  }

  stats.loginSuccess += 1
  onlineBots.set(credentials.username, bot)
  highestOnlineCount = Math.max(highestOnlineCount, onlineBots.size)
  upsertAccount(credentials)
  console.log(`[${credentials.username}] login confirmed, bot kept online (${onlineBots.size}/${config.targetOnlineBots})`)
  return { ok: true, credentials }
}

async function runCandidate(candidate) {
  for (let attemptNumber = 0; attemptNumber <= config.retryCount; attemptNumber += 1) {
    const result = await attemptBot(candidate, attemptNumber)
    if (result.ok) {
      return { ok: true, credentials: result.credentials }
    }

    if (result.usernameCollision) {
      return { ok: false, credentials: result.credentials, terminal: true }
    }

    if (!result.retryable) {
      return { ok: false, credentials: result.credentials, terminal: false }
    }

    if (attemptNumber < config.retryCount) {
      stats.retries += 1
      console.log(`[${candidate.username}] retrying after ${config.retryDelayMs}ms`)
      await sleep(config.retryDelayMs)
    }
  }

  return { ok: false, credentials: candidate, terminal: true }
}

function nextCandidate(index) {
  if (savedQueue.length > 0) {
    const saved = savedQueue.shift()
    return {
      username: saved.username,
      password: saved.password,
      source: 'saved'
    }
  }

  stats.generatedAccounts += 1
  return {
    username: buildUsername(index, config),
    password: buildPassword(config),
    source: 'new'
  }
}

async function runCampaign() {
  console.log(`Target: ${config.host}:${config.port}`)
  console.log('Only use this script for your own localhost or servers you control for anti-bot testing.')
  console.log(`Saved accounts at startup: ${savedQueue.length}`)
  console.log(`Goal: keep ${config.targetOnlineBots} bot(s) online from the same IP until the anti-bot blocks the source IP.`)

  try {
    await preflightPing(config)
  } catch (error) {
    launchPhaseFinished = true
    launchStoppedByFailure = true
    console.error(`Preflight ping failed: ${error.message}`)
    maybeExit()
    return
  }

  let candidateIndex = 0

  while (!shuttingDown && !successTriggered && onlineBots.size < config.targetOnlineBots) {
    candidateIndex += 1
    const candidate = nextCandidate(candidateIndex)
    const result = await runCandidate(candidate)

    if (!result.ok) {
      if (candidate.source === 'saved') {
        console.log(`[${candidate.username}] saved account could not be restored`)
      } else {
        console.log(`[${candidate.username}] generated account failed`)
      }
    }

    if (!shuttingDown && !successTriggered && onlineBots.size < config.targetOnlineBots) {
      await sleep(config.nextBotDelayMs)
    }
  }

  launchPhaseFinished = true

  if (!successTriggered) {
    console.log('Launch phase finished. Monitoring online bots until they disconnect or you stop the script.')
  }

  maybeExit()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

runCampaign().catch((error) => {
  launchPhaseFinished = true
  launchStoppedByFailure = true
  console.error(`Fatal error: ${error.stack || error.message}`)
  maybeExit()
})
