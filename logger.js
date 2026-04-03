const fs = require('fs')
const path = require('path')
const util = require('util')
const { spawnSync } = require('child_process')

const LOG_DIR = path.join(__dirname, 'logs')
const ARCHIVE_PATH = path.join(LOG_DIR, 'logs.zip')
const LATEST_LOG_PATH = path.join(LOG_DIR, 'latest.log')

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function formatTimestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function buildArchivedLogName(date) {
  return `run-${formatTimestampForFile(date)}.log`
}

function getUniqueArchivedLogPath(baseName) {
  const extension = path.extname(baseName)
  const basename = path.basename(baseName, extension)
  let candidate = path.join(LOG_DIR, baseName)
  let suffix = 1

  while (fs.existsSync(candidate)) {
    candidate = path.join(LOG_DIR, `${basename}-${suffix}${extension}`)
    suffix += 1
  }

  return candidate
}

function escapePowerShellSingleQuoted(value) {
  return value.replace(/'/g, "''")
}

function archiveFiles(filePaths) {
  if (filePaths.length === 0) {
    return
  }

  const literalPaths = filePaths
    .map((filePath) => `'${escapePowerShellSingleQuoted(filePath)}'`)
    .join(', ')
  const archivePath = `'${escapePowerShellSingleQuoted(ARCHIVE_PATH)}'`
  const command = `Compress-Archive -LiteralPath @(${literalPaths}) -DestinationPath ${archivePath} -Update -CompressionLevel Optimal`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8'
  })

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`Failed to archive log files into logs.zip${details ? `: ${details}` : ''}`)
  }
}

function archiveExistingLogs() {
  ensureLogDir()

  const archiveCandidates = new Set()

  if (fs.existsSync(LATEST_LOG_PATH)) {
    const latestStats = fs.statSync(LATEST_LOG_PATH)
    if (latestStats.size > 0) {
      const archivedName = buildArchivedLogName(latestStats.birthtimeMs > 0 ? latestStats.birthtime : latestStats.mtime)
      const archivedPath = getUniqueArchivedLogPath(archivedName)
      fs.renameSync(LATEST_LOG_PATH, archivedPath)
      archiveCandidates.add(archivedPath)
    } else {
      fs.rmSync(LATEST_LOG_PATH, { force: true })
    }
  }

  for (const entry of fs.readdirSync(LOG_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue
    }

    if (!/^run-.*\.log$/i.test(entry.name)) {
      continue
    }

    archiveCandidates.add(path.join(LOG_DIR, entry.name))
  }

  const filesToArchive = Array.from(archiveCandidates)

  if (filesToArchive.length === 0) {
    return
  }

  archiveFiles(filesToArchive)

  for (const filePath of filesToArchive) {
    fs.rmSync(filePath, { force: true })
  }
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
  archiveExistingLogs()

  const logFilePath = LATEST_LOG_PATH
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
