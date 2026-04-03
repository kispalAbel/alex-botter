const fs = require('fs')
const path = require('path')
const util = require('util')

const LOG_DIR = path.join(__dirname, 'logs')

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function buildLogFilePath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(LOG_DIR, `run-${timestamp}.log`)
}

function serializeArg(arg) {
  if (typeof arg === 'string') {
    return arg
  }

  if (arg instanceof Error) {
    return arg.stack || arg.message
  }

  return util.inspect(arg, {
    depth: 6,
    breakLength: 120,
    compact: false
  })
}

function formatArgs(args) {
  return args.map((arg) => serializeArg(arg)).join(' ')
}

function createLogger() {
  ensureLogDir()

  const logFilePath = buildLogFilePath()
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' })

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  }

  function write(level, args) {
    const message = formatArgs(args)
    const line = `[${new Date().toISOString()}] [${level}] ${message}`
    logStream.write(`${line}\n`)
  }

  function wrap(methodName, level) {
    return (...args) => {
      write(level, args)
      original[methodName](...args)
    }
  }

  console.log = wrap('log', 'INFO')
  console.info = wrap('info', 'INFO')
  console.warn = wrap('warn', 'WARN')
  console.error = wrap('error', 'ERROR')

  process.on('uncaughtException', (error) => {
    write('FATAL', [error])
    original.error(error)
  })

  process.on('unhandledRejection', (reason) => {
    write('FATAL', [reason])
    original.error(reason)
  })

  process.on('exit', () => {
    logStream.end()
  })

  console.log(`Logger initialized: ${logFilePath}`)

  return {
    logFilePath
  }
}

module.exports = {
  createLogger
}
