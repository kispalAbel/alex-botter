const { EventEmitter } = require('events')

const mc = require('minecraft-protocol')
const minecraftData = require('minecraft-data')

const RESOURCE_PACK_RESULTS = {
  SUCCESSFULLY_LOADED: 0,
  DECLINED: 1,
  FAILED_DOWNLOAD: 2,
  ACCEPTED: 3
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function extractText(value) {
  if (typeof value === 'string') {
    try {
      return extractText(JSON.parse(value))
    } catch (error) {
      return value
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => extractText(entry)).join('')
  }

  if (!isPlainObject(value)) {
    return value == null ? '' : String(value)
  }

  const parts = []

  if (typeof value.text === 'string') parts.push(value.text)
  if (typeof value.translate === 'string') parts.push(value.translate)
  if (typeof value.keybind === 'string') parts.push(value.keybind)
  if (typeof value.selector === 'string') parts.push(value.selector)
  if (typeof value.score?.value === 'string') parts.push(value.score.value)
  if (Array.isArray(value.with)) parts.push(value.with.map((entry) => extractText(entry)).join(' '))
  if (Array.isArray(value.extra)) parts.push(value.extra.map((entry) => extractText(entry)).join(''))

  return parts.join('').trim()
}

function resolvePosition(currentPosition, packet) {
  const nextPosition = { ...currentPosition }
  let nextYaw = packet.yaw ?? currentPosition.yaw
  let nextPitch = packet.pitch ?? currentPosition.pitch

  if (typeof packet.flags === 'object' && packet.flags !== null) {
    nextPosition.x = packet.flags.x ? currentPosition.x + packet.x : packet.x
    nextPosition.y = packet.flags.y ? currentPosition.y + packet.y : packet.y
    nextPosition.z = packet.flags.z ? currentPosition.z + packet.z : packet.z
    nextYaw = (packet.flags.yaw ? currentPosition.yaw : 0) + packet.yaw
    nextPitch = (packet.flags.pitch ? currentPosition.pitch : 0) + packet.pitch
  } else {
    const flags = Number(packet.flags ?? 0)
    nextPosition.x = flags & 1 ? currentPosition.x + packet.x : packet.x
    nextPosition.y = flags & 2 ? currentPosition.y + packet.y : packet.y
    nextPosition.z = flags & 4 ? currentPosition.z + packet.z : packet.z
    nextYaw = (flags & 8 ? currentPosition.yaw : 0) + packet.yaw
    nextPitch = (flags & 16 ? currentPosition.pitch : 0) + packet.pitch
  }

  nextPosition.yaw = nextYaw
  nextPosition.pitch = nextPitch
  return nextPosition
}

function createLeanBot(options) {
  const client = mc.createClient({
    host: options.host,
    port: options.port,
    username: options.username,
    version: options.version,
    auth: 'offline',
    hideErrors: true,
    connectTimeout: options.connectTimeout,
    connect: options.connect
  })

  const bot = new EventEmitter()
  const mcData = minecraftData(client.version)
  let spawned = false
  let latestResourcePackHash = null
  let latestResourcePackUuid = null
  let position = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    onGround: false
  }
  let positionHeartbeat = null

  function writePacket(packetName, payload) {
    try {
      client.write(packetName, payload)
    } catch (error) {
      const packetError = new Error(`Packet write failed for ${packetName}: ${error.message}`)
      packetError.cause = error
      packetError.packetName = packetName
      packetError.packetPayload = payload
      throw packetError
    }
  }

  function emitSpawnOnce() {
    if (spawned) return
    spawned = true
    bot.emit('spawn')
  }

  function writePositionPacket(packetName = 'position') {
    const payload = {
      x: position.x,
      y: position.y,
      z: position.z,
      flags: {
        onGround: position.onGround,
        hasHorizontalCollision: undefined
      }
    }

    if (packetName === 'position_look') {
      payload.yaw = position.yaw
      payload.pitch = position.pitch
    }

    writePacket(packetName, payload)
  }

  function startPositionHeartbeat() {
    if (positionHeartbeat) return
    positionHeartbeat = setInterval(() => {
      if (client.state === 'play' || String(client.state).toLowerCase().includes('play')) {
        writePositionPacket()
      }
    }, 15000)
  }

  function stopPositionHeartbeat() {
    if (!positionHeartbeat) return
    clearInterval(positionHeartbeat)
    positionHeartbeat = null
  }

  function emitMessage(message) {
    const text = extractText(message)
    if (text.length > 0) {
      bot.emit('messagestr', text)
    }
  }

  bot.chat = (message) => {
    if (typeof client.chat === 'function') {
      client.chat(message)
      return
    }

    writePacket('chat', { message })
  }

  bot.acceptResourcePack = () => {
    if (mcData.supportFeature('resourcePackUsesHash')) {
      writePacket('resource_pack_receive', {
        result: RESOURCE_PACK_RESULTS.ACCEPTED,
        hash: latestResourcePackHash
      })
      writePacket('resource_pack_receive', {
        result: RESOURCE_PACK_RESULTS.SUCCESSFULLY_LOADED,
        hash: latestResourcePackHash
      })
      return
    }

    if (mcData.supportFeature('resourcePackUsesUUID')) {
      writePacket('resource_pack_receive', {
        uuid: latestResourcePackUuid,
        result: RESOURCE_PACK_RESULTS.ACCEPTED
      })
      writePacket('resource_pack_receive', {
        uuid: latestResourcePackUuid,
        result: RESOURCE_PACK_RESULTS.SUCCESSFULLY_LOADED
      })
      return
    }

    writePacket('resource_pack_receive', {
      result: RESOURCE_PACK_RESULTS.ACCEPTED
    })
    writePacket('resource_pack_receive', {
      result: RESOURCE_PACK_RESULTS.SUCCESSFULLY_LOADED
    })
  }

  bot.quit = (reason) => {
    stopPositionHeartbeat()
    client.end(reason)
  }

  bot.end = (reason) => {
    stopPositionHeartbeat()
    client.end(reason)
  }

  client.on('connect', () => {
    bot.emit('connect')
  })

  client.on('login', (packet) => {
    writePacket('settings', {
      locale: 'en_US',
      viewDistance: 2,
      chatFlags: 0,
      chatColors: false,
      skinParts: 0,
      mainHand: 1,
      enableTextFiltering: false,
      enableServerListing: false,
      particleStatus: 'minimal'
    })

    bot.emit('login', packet)
  })

  client.on('playerJoin', () => {
    emitSpawnOnce()
    startPositionHeartbeat()
  })

  client.on('position', (packet) => {
    position = resolvePosition(position, packet)
    position.onGround = false

    if (mcData.supportFeature('teleportUsesOwnPacket') && packet.teleportId !== undefined) {
      writePacket('teleport_confirm', { teleportId: packet.teleportId })
    }

    writePositionPacket('position_look')
    emitSpawnOnce()
    startPositionHeartbeat()
  })

  client.on('systemChat', (packet) => {
    emitMessage(packet.formattedMessage)
  })

  client.on('playerChat', (packet) => {
    emitMessage(packet.plainMessage || packet.unsignedContent || packet.formattedMessage)
  })

  client.on('disconnect', (packet) => {
    bot.emit('kicked', packet?.reason ?? packet)
  })

  client.on('resource_pack_send', (packet) => {
    latestResourcePackHash = packet.hash
    latestResourcePackUuid = packet.uuid
    bot.emit('resourcePack', packet.url, packet.hash ?? packet.uuid)
  })

  client.on('add_resource_pack', (packet) => {
    latestResourcePackUuid = packet.uuid
    bot.emit('resourcePack', packet.url, packet.uuid)
  })

  client.on('error', (error) => {
    bot.emit('error', error)
  })

  client.on('end', (reason) => {
    stopPositionHeartbeat()
    bot.emit('end', reason)
  })

  bot.hasSessionStarted = () => spawned

  return bot
}

module.exports = {
  createLeanBot
}
