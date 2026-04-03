const minecraftProtocol = require('minecraft-protocol')
const https = require('https')
const net = require('net')
const fs = require('fs')
const path = require('path')
const { createLeanBot } = require('./lean-bot')
const { createLogger } = require('./logger')

const CONFIG_PATH = path.join(__dirname, 'config.json')
const DEFAULT_CONFIG = {
  proxyAuth: {
    username: 'REPLACE_WITH_PROXY_USERNAME',
    password: 'REPLACE_WITH_PROXY_PASSWORD'
  },
  proxies: [],
  host: 'localhost',
  port: 25565,
  version: false,
  targetOnlineBots: 10,
  retryCount: 4,
  retryDelayMs: 2000,
  probeTimeoutMs: 5000,
  connectTimeoutMs: 15000,
  readyTimeoutMs: 15000,
  authTimeoutMs: 15000,
  nextBotDelayMs: 1000,
  commandDelayMs: 700,
  disconnectWaveWindowMs: 5000,
  disconnectWaveMinCount: 5,
  disconnectWaveRatio: 0.5,
  fullyRandomNames: true,
  startWith: 'bot',
  usernameLength: 12,
  passwordLength: 12,
  savedAccountFailureLimit: 3,
  accountsFile: 'stored_bots.json',
  registerCommand: '/register {password} {password}',
  loginCommand: '/login {password}',
  registerPromptPatterns: [
    '/register',
    'please register',
    'register to continue',
    'regisztralj',
    'regisztracio',
    'elobb regisztralj',
    'register first'
  ],
  registerSuccessPatterns: [
    'successfully registered',
    'registered successfully',
    'sikeresen regisztralt',
    'sikeres regisztracio'
  ],
  loginPromptPatterns: [
    '/login',
    'please login',
    'login to continue',
    'jelentkezz be',
    'bejelentkezes'
  ],
  loginSuccessPatterns: [
    'successfully logged in',
    'logged in successfully',
    'successful login',
    'sikeresen bejelentkeztel',
    'sikeres bejelentkezes',
    'sikeresen beleptel'
  ],
  alreadyRegisteredPatterns: [
    'already registered',
    'account already exists',
    'mar regisztralt',
    'mar letezik'
  ],
  invalidPasswordPatterns: [
    'wrong password',
    'incorrect password',
    'invalid password',
    'hibas jelszo',
    'rossz jelszo',
    'masik jelszoval',
    'another password'
  ],
  needsRegisterPatterns: [
    'register first',
    'please register first',
    'elobb regisztralj',
    'elobb regisztralnod kell'
  ],
  alreadyLoggedInPatterns: [
    'already logged in',
    'already authenticated',
    'mar be vagy jelentkezve',
    'mar hitelesitve vagy'
  ]
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function applyConfigDefaults(target, defaults) {
  let changed = false

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = structuredClone(defaultValue)
      changed = true
      continue
    }

    if (isPlainObject(defaultValue) && isPlainObject(target[key])) {
      changed = applyConfigDefaults(target[key], defaultValue) || changed
    }
  }

  return changed
}

function isLoopbackHost(host) {
  const normalized = String(host ?? '').trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function fetchPublicIpv4() {
  return new Promise((resolve, reject) => {
    const request = https.get('https://api.ipify.org', { timeout: 5000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`public IP lookup failed with HTTP ${response.statusCode}`))
        return
      }

      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        const ip = body.trim()
        if (net.isIP(ip) !== 4) {
          reject(new Error(`public IP lookup returned invalid IPv4 "${ip}"`))
          return
        }

        resolve(ip)
      })
    })

    request.on('timeout', () => {
      request.destroy(new Error('public IP lookup timed out'))
    })
    request.on('error', reject)
  })
}

async function resolveTargetHost(host, useProxy) {
  if (!useProxy || !isLoopbackHost(host)) {
    return host
  }

  const publicIpv4 = await fetchPublicIpv4()
  console.log(`Loopback host detected in proxy mode, resolved target host to public IPv4 ${publicIpv4}`)
  return publicIpv4
}

createLogger()

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

  const configWasUpdated = applyConfigDefaults(config, DEFAULT_CONFIG)
  if (configWasUpdated) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
    console.log('A config.json kiegeszult a hianyzo alapertelmezett mezokkel.')
  }

  if (!config.host || typeof config.host !== 'string') {
    console.error('Hiba: a config.json "host" mezoje kotelezo.')
    process.exit(1)
  }

  return {
    host: config.host,
    port: Number(config.port ?? 25565),
    version: config.version ?? false,
    proxyAuth: config.proxyAuth ?? {},
    proxies: Array.isArray(config.proxies) ? config.proxies : [],
    targetOnlineBots: Number(config.targetOnlineBots ?? 10),
    retryCount: Number(config.retryCount ?? 4),
    retryDelayMs: Number(config.retryDelayMs ?? 2000),
    probeTimeoutMs: Number(config.probeTimeoutMs ?? 5000),
    connectTimeoutMs: Number(config.connectTimeoutMs ?? 15000),
    readyTimeoutMs: Number(config.readyTimeoutMs ?? 15000),
    authTimeoutMs: Number(config.authTimeoutMs ?? 15000),
    nextBotDelayMs: Number(config.nextBotDelayMs ?? 1000),
    commandDelayMs: Number(config.commandDelayMs ?? 700),
    usernameLength: Number(config.usernameLength ?? 12),
    passwordLength: Number(config.passwordLength ?? 12),
    savedAccountFailureLimit: Number(config.savedAccountFailureLimit ?? 3),
    accountsFile: String(config.accountsFile ?? 'stored_bots.json'),
    registerCommand: String(config.registerCommand ?? '/register {password} {password}'),
    loginCommand: String(config.loginCommand ?? '/login {password}'),
    disconnectWaveWindowMs: Number(config.disconnectWaveWindowMs ?? 5000),
    disconnectWaveMinCount: Number(config.disconnectWaveMinCount ?? 5),
    disconnectWaveRatio: Number(config.disconnectWaveRatio ?? 0.5),
    fullyRandomNames: config.fullyRandomNames !== false,
    startWith: String(config.startWith ?? 'bot'),
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
    'savedAccountFailureLimit',
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

  if (!Array.isArray(config.proxies)) {
    console.error('Hiba: a proxies tomb legyen, ha meg van adva.')
    process.exit(1)
  }

  if (config.proxies.length === 0) {
    console.error('Hiba: legalabb egy proxy legyen megadva a proxies tombben.')
    process.exit(1)
  }

  if (!config.proxyAuth || typeof config.proxyAuth !== 'object' || Array.isArray(config.proxyAuth)) {
    console.error('Hiba: a proxyAuth objektum legyen.')
    process.exit(1)
  }

  if (typeof config.proxyAuth.username !== 'string' || config.proxyAuth.username.length === 0) {
    console.error('Hiba: a proxyAuth.username kotelezo.')
    process.exit(1)
  }

  if (typeof config.proxyAuth.password !== 'string' || config.proxyAuth.password.length === 0) {
    console.error('Hiba: a proxyAuth.password kotelezo.')
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

function buildUsername(config) {
  const totalLength = Math.max(3, Math.min(16, config.usernameLength))
  const firstCharChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const restChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'

  if (config.fullyRandomNames) {
    const firstChar = randomString(1, firstCharChars)
    const rest = randomString(totalLength - 1, restChars)
    return `${firstChar}${rest}`.slice(0, 16)
  }

  const safePrefix = config.startWith.replace(/[^A-Za-z0-9_]/g, '')
  const trimmedPrefix = safePrefix.slice(0, Math.max(1, totalLength - 1))

  if (trimmedPrefix.length === 0) {
    const firstChar = randomString(1, firstCharChars)
    const rest = randomString(totalLength - 1, restChars)
    return `${firstChar}${rest}`.slice(0, 16)
  }

  const needsLeadingLetter = !/^[A-Za-z]/.test(trimmedPrefix)
  const prefixBase = needsLeadingLetter
    ? `${randomString(1, firstCharChars)}${trimmedPrefix}`
    : trimmedPrefix

  const finalPrefix = prefixBase.slice(0, totalLength)
  const remaining = Math.max(0, totalLength - finalPrefix.length)
  const suffix = randomString(remaining, restChars)
  return `${finalPrefix}${suffix}`.slice(0, 16)
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

function parseProxyEntry(entry, index) {
  if (typeof entry === 'string') {
    let parsed
    try {
      parsed = new URL(entry)
    } catch (error) {
      throw new Error(`Hiba: ervenytelen proxy URL a proxies[${index}] mezoben: ${error.message}`)
    }

    const protocol = parsed.protocol.replace(':', '').toLowerCase()
    if (protocol !== 'http') {
      throw new Error(`Hiba: csak http proxy tamogatott, proxies[${index}] = ${entry}`)
    }

    return {
      type: protocol,
      host: parsed.hostname,
      port: Number(parsed.port || 1080)
    }
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error(`Hiba: ervenytelen proxy bejegyzes a proxies[${index}] helyen.`)
  }

  const type = String(entry.type ?? 'http').toLowerCase()
  if (type !== 'http') {
    throw new Error(`Hiba: csak http proxy tamogatott, proxies[${index}].type = ${type}`)
  }

  if (typeof entry.host !== 'string' || entry.host.trim().length === 0) {
    throw new Error(`Hiba: a proxies[${index}].host kotelezo.`)
  }

  const port = Number(entry.port ?? 1080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Hiba: ervenytelen proxy port a proxies[${index}] helyen.`)
  }

  return {
    type,
    host: entry.host,
    port
  }
}

function buildProxyList(entries) {
  return entries.map((entry, index) => parseProxyEntry(entry, index))
}

async function preflightPing(config) {
  console.log(`Preflight ping: ${targetHost}:${config.port}`)
  const response = await minecraftProtocol.ping({
    host: targetHost,
    port: config.port,
    version: config.version || undefined,
    closeTimeout: config.probeTimeoutMs,
    noPongTimeout: config.probeTimeoutMs
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
        password: entry.password,
        proxyHost: typeof entry.proxyHost === 'string' && entry.proxyHost.length > 0 ? entry.proxyHost : null,
        proxyPort: Number.isInteger(entry.proxyPort) && entry.proxyPort > 0 ? entry.proxyPort : null,
        restoreFailures: Number.isInteger(entry.restoreFailures) && entry.restoreFailures > 0 ? entry.restoreFailures : 0
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
const proxies = buildProxyList(config.proxies)
const proxyAuth = {
  username: String(config.proxyAuth.username),
  password: String(config.proxyAuth.password)
}
let targetHost = config.host

const ACCOUNTS_PATH = path.join(__dirname, config.accountsFile)
const accounts = loadAccounts(ACCOUNTS_PATH)
const savedQueue = accounts.map((entry) => ({ ...entry }))
const activeBots = new Set()
const onlineBots = new Map()
const disconnectEvents = []
const onlineProxyUsage = new Map()

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
function getProxyKey(proxy) {
  if (!proxy) {
    return null
  }

  return `${proxy.host}:${proxy.port}`
}

function findConfiguredProxy(entry) {
  if (!entry || typeof entry.proxyHost !== 'string' || !Number.isInteger(entry.proxyPort)) {
    return null
  }

  return proxies.find((proxy) => getProxyKey(proxy) === `${entry.proxyHost}:${entry.proxyPort}`) ?? null
}

function getLeastUsedProxy() {
  if (proxies.length === 0) {
    return null
  }

  let lowestUsage = Number.POSITIVE_INFINITY
  const candidates = []

  for (const proxy of proxies) {
    const usage = onlineProxyUsage.get(getProxyKey(proxy)) ?? 0
    if (usage < lowestUsage) {
      lowestUsage = usage
      candidates.length = 0
      candidates.push(proxy)
      continue
    }

    if (usage === lowestUsage) {
      candidates.push(proxy)
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)] ?? proxies[0]
}

function incrementProxyUsage(proxy) {
  const proxyKey = getProxyKey(proxy)
  if (!proxyKey) {
    return
  }

  onlineProxyUsage.set(proxyKey, (onlineProxyUsage.get(proxyKey) ?? 0) + 1)
}

function decrementProxyUsage(proxy) {
  const proxyKey = getProxyKey(proxy)
  if (!proxyKey) {
    return
  }

  const nextValue = (onlineProxyUsage.get(proxyKey) ?? 1) - 1
  if (nextValue <= 0) {
    onlineProxyUsage.delete(proxyKey)
    return
  }

  onlineProxyUsage.set(proxyKey, nextValue)
}

function connectSocket(socketOptions) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketOptions)
    const onError = (error) => reject(error)

    socket.once('error', onError)
    socket.once('connect', () => {
      socket.removeListener('error', onError)
      resolve(socket)
    })
  })
}

function writeToSocket(socket, buffer) {
  return new Promise((resolve, reject) => {
    socket.write(buffer, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function readHttpHeaders(socket) {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0)
    const delimiter = Buffer.from('\r\n\r\n')

    const cleanup = () => {
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('close', onClose)
      socket.removeListener('end', onEnd)
    }

    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk])
      const headerEnd = buffered.indexOf(delimiter)
      if (headerEnd === -1) {
        return
      }

      cleanup()
      const response = buffered.subarray(0, headerEnd + delimiter.length)
      const remaining = buffered.subarray(headerEnd + delimiter.length)
      if (remaining.length > 0) {
        socket.unshift(remaining)
      }
      resolve(response.toString('utf8'))
    }

    const onError = (error) => {
      cleanup()
      reject(error)
    }

    const onClose = () => {
      cleanup()
      reject(new Error('proxy socket closed while waiting for CONNECT response'))
    }

    const onEnd = () => {
      cleanup()
      reject(new Error('proxy socket ended while waiting for CONNECT response'))
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('close', onClose)
    socket.once('end', onEnd)
  })
}

async function establishHttpTunnel(proxy, targetHost, targetPort) {
  const socketOptions = {
    host: proxy.host,
    port: proxy.port
  }

  const socket = await connectSocket(socketOptions)

  const requestLines = [
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
    `Host: ${targetHost}:${targetPort}`,
    'Proxy-Connection: Keep-Alive'
  ]

  if (proxyAuth.username || proxyAuth.password) {
    const authToken = Buffer.from(`${proxyAuth.username}:${proxyAuth.password}`, 'utf8').toString('base64')
    requestLines.push(`Proxy-Authorization: Basic ${authToken}`)
  }

  requestLines.push('', '')
  await writeToSocket(socket, Buffer.from(requestLines.join('\r\n'), 'utf8'))

  const response = await readHttpHeaders(socket)
  const [statusLine] = response.split('\r\n')
  const match = /^HTTP\/\d+\.\d+\s+(\d{3})/.exec(statusLine)
  if (!match) {
    throw new Error(`proxy connect failed: invalid response "${statusLine}"`)
  }

  const statusCode = Number(match[1])
  if (statusCode !== 200) {
    throw new Error(`proxy connect failed with HTTP status ${statusCode}`)
  }

  return socket
}

async function createTransportSocket(targetHost, targetPort, proxy) {
  return establishHttpTunnel(proxy, targetHost, targetPort)
}

function upsertAccount(credentials, proxy = null) {
  const index = accounts.findIndex((entry) => entry.username === credentials.username)
  const nextEntry = {
    username: credentials.username,
    password: credentials.password,
    proxyHost: proxy?.host ?? null,
    proxyPort: proxy?.port ?? null,
    restoreFailures: 0
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

function noteSavedAccountFailure(username, reason) {
  const entry = accounts.find((account) => account.username === username)
  if (!entry) {
    return { removed: false, failures: 0 }
  }

  entry.restoreFailures = (Number.isInteger(entry.restoreFailures) ? entry.restoreFailures : 0) + 1
  persistAccounts(ACCOUNTS_PATH, accounts)
  console.log(
    `[${username}] saved restore failed (${reason}), consecutive failures ${entry.restoreFailures}/${config.savedAccountFailureLimit}`
  )

  if (entry.restoreFailures >= config.savedAccountFailureLimit) {
    removeAccount(username, `saved_restore_failures:${reason}`)
    return { removed: true, failures: entry.restoreFailures }
  }

  return { removed: false, failures: entry.restoreFailures }
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

    if (!onlineBots.has(credentials.username)) {
      closeBot(bot, 'client-error')
    }
  })

  bot.on('end', (reason) => {
    stats.ended += 1
    activeBots.delete(bot)

    if (onlineBots.has(credentials.username)) {
      decrementProxyUsage(bot.assignedProxy ?? null)
      onlineBots.delete(credentials.username)
      if (!shuttingDown) {
        recordDisconnectWave()
      }
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
      upsertAccount(credentials, credentials.proxy ?? null)
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
    upsertAccount(credentials, credentials.proxy ?? null)
    return finishLogin(bot, credentials)
  }

  if (registerResult.type === 'already_registered') {
    return { ok: false, result: registerResult, removeAccount: false, usernameCollision: true }
  }

  if (registerResult.type === 'login_success') {
    upsertAccount(credentials, credentials.proxy ?? null)
    return { ok: true }
  }

  return { ok: false, result: registerResult, removeAccount: false }
}

async function attemptBot(candidate, attemptNumber) {
  if (candidate.missingSavedProxy) {
    console.log(`[${candidate.username}] saved proxy ${candidate.proxyHost}:${candidate.proxyPort} is not in current config, skipping account`)
    return {
      ok: false,
      retryable: false,
      result: { type: 'missing_saved_proxy' },
      credentials: {
        username: candidate.username,
        password: candidate.password
      }
    }
  }

  const credentials = {
    username: candidate.username,
    password: candidate.password,
    proxy: candidate.proxy ?? null
  }
  const proxy = credentials.proxy ?? getLeastUsedProxy()
  credentials.proxy = proxy

  stats.launchAttempts += 1
  console.log(`[${credentials.username}] attempt ${attemptNumber + 1}/${config.retryCount + 1} (${candidate.source})`)
  if (proxy) {
    console.log(`[${credentials.username}] using proxy ${proxy.host}:${proxy.port}`)
  }

  const bot = createLeanBot({
    host: targetHost,
    port: config.port,
    username: credentials.username,
    version: config.version,
    connectTimeout: config.connectTimeoutMs,
    connect: (client) => {
      createTransportSocket(targetHost, config.port, proxy)
        .then((socket) => {
          client.setSocket(socket)
          client.emit('connect')
        })
        .catch((error) => {
          client.emit('error', error)
          client.emit('end', error)
        })
    }
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
    const shouldRetrySameUsername = authResult.removeAccount !== true && bot.hasSessionStarted() !== true

    if (authResult.removeAccount) {
      removeAccount(credentials.username, authResult.result?.type || 'invalid_saved_account')
    }
    closeBot(bot, `auth-failed:${authResult.result?.type || 'unknown'}`)
    return {
      ok: false,
      retryable: !authResult.removeAccount && shouldRetrySameUsername,
      result: authResult.result,
      credentials,
      usernameCollision: authResult.usernameCollision === true,
      sessionStarted: bot.hasSessionStarted() === true
    }
  }

  stats.loginSuccess += 1
  bot.assignedProxy = credentials.proxy ?? null
  onlineBots.set(credentials.username, bot)
  incrementProxyUsage(credentials.proxy ?? null)
  highestOnlineCount = Math.max(highestOnlineCount, onlineBots.size)
  upsertAccount(credentials, credentials.proxy ?? null)
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
    const savedProxy = findConfiguredProxy(saved)
    return {
      username: saved.username,
      password: saved.password,
      source: 'saved',
      proxy: savedProxy,
      proxyHost: saved.proxyHost ?? null,
      proxyPort: saved.proxyPort ?? null,
      restoreFailures: saved.restoreFailures ?? 0,
      missingSavedProxy: saved.proxyHost != null && saved.proxyPort != null && savedProxy == null
    }
  }

  stats.generatedAccounts += 1
  return {
    username: buildUsername(config),
    password: buildPassword(config),
    source: 'new',
    proxy: getLeastUsedProxy()
  }
}

async function runCampaign() {
  try {
    targetHost = await resolveTargetHost(config.host, proxies.length > 0)
  } catch (error) {
    launchPhaseFinished = true
    launchStoppedByFailure = true
    console.error(`Target host resolution failed: ${error.message}`)
    maybeExit()
    return
  }

  console.log(`Target: ${targetHost}:${config.port}`)
  console.log('Only use this script for your own localhost or servers you control for anti-bot testing.')
  console.log(`Saved accounts at startup: ${savedQueue.length}`)
  console.log(`Goal: keep ${config.targetOnlineBots} bot(s) online from the same IP until the anti-bot blocks the source IP.`)

  try {
    await preflightPing(config)
  } catch (error) {
    if (proxies.length > 0) {
      console.warn(`Preflight ping failed, continuing with proxy connections: ${error.message}`)
    } else {
      launchPhaseFinished = true
      launchStoppedByFailure = true
      console.error(`Preflight ping failed: ${error.message}`)
      maybeExit()
      return
    }
  }

  let candidateIndex = 0

  while (!shuttingDown && !successTriggered && onlineBots.size < config.targetOnlineBots) {
    candidateIndex += 1
    const candidate = nextCandidate(candidateIndex)
    const result = await runCandidate(candidate)

    if (!result.ok) {
      if (candidate.source === 'saved') {
        const failureReason = result.result?.type || (result.terminal ? 'terminal' : 'unknown')
        noteSavedAccountFailure(candidate.username, failureReason)
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
