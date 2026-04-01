const mineflayer = require('mineflayer')
const fs = require('fs')
const path = require('path')

// ---------- CONFIG ----------
const BOT_DATA_FILE = path.join(__dirname, 'bot_data.json')
const IP_FILE = path.join(__dirname, 'ip.json')
const maxRetries = 3
const delayBetweenBots = 20000 // 20 mp minden bot között
const registerDelay = 10000     // 10 mp a regisztráció és spawn után
const retryDelay = 7000         // 7 mp retry előtt
const nextBotDelay = 5000       // 5 mp wait kick után
// ----------------------------

// IP betöltése
if (!fs.existsSync(IP_FILE)) {
  console.error("Hiba: ip.json nem található!")
  process.exit(1)
}

let ipData
try {
  ipData = JSON.parse(fs.readFileSync(IP_FILE, 'utf-8'))
} catch (err) {
  console.error("Hiba: ip.json nem érvényes JSON!")
  process.exit(1)
}

// Random string generálása botnak
function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Betöltjük a meglévő botokat
let botList = []
if (fs.existsSync(BOT_DATA_FILE)) {
  try {
    const data = fs.readFileSync(BOT_DATA_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    botList = Array.isArray(parsed) ? parsed : []
  } catch (err) {
    botList = []
  }
}

let currentIndex = 0

// Következő bot indítása
function nextBot() {
  if (currentIndex < botList.length) {
    const botData = botList[currentIndex]
    currentIndex++
    setTimeout(() => createBot(botData.username, botData.password), delayBetweenBots)
  } else {
    // Új bot generálása
    const username = randomString(10)
    const password = randomString(12)
    botList.push({ username, password })
    fs.writeFileSync(BOT_DATA_FILE, JSON.stringify(botList, null, 2))
    currentIndex++
    setTimeout(() => createBot(username, password), delayBetweenBots)
  }
}

// Bot létrehozása
function createBot(username, password, retries = 0) {
  const config = {
    host: ipData.host,
    port: ipData.port || 25565,
    username: username,
    version: false
  }

  const bot = mineflayer.createBot(config)

  bot.on('login', () => {
    console.log(`${username} LOGIN_SUCCESS`)
    
    // Register parancs
    bot.chat(`/register ${password} ${password}`)

    // Várunk spawn és regisztráció után a következő botra
    setTimeout(() => nextBot(), registerDelay)
  })

  bot._client.on('resource_pack_send', () => {
    console.log(`${username} TEXTURE_PACK`)
    bot._client.write('resource_pack_receive', { result: 3 })
  })

  bot.on('spawn', () => {
    console.log(`${username} SPAWNED`)
  })

  bot.on('kicked', (reason) => {
    console.log(`${username} KICKED: ${reason}`)
  })

  bot.on('end', () => {
    if (retries < maxRetries) {
      retries++
      console.log(`${username} újrapróbálkozás ${retries}/${maxRetries}`)
      setTimeout(() => createBot(username, password, retries), retryDelay)
    } else {
      console.log(`${username} FAILED`)
      setTimeout(() => nextBot(), nextBotDelay)
    }
  })

  bot.on('error', (err) => {
    console.error(`${username} ERROR:`, err)
  })
}

// Indítás
nextBot()