const execa = require('execa')
const Path = require('path')
const Fs = require('fs')
const { readFile, writeFile, access } = Fs.promises
const Os = require('os')
const { promisify } = require('util')
const mkdirp = promisify(require('mkdirp'))
const merge = require('deepmerge')

const installedExecPaths = Object.freeze({
  ipfs: (() => {
    try {
      // require.resolve('ipfs') = node_modules/ipfs/src/core/index.js
      const path = Path.dirname(require.resolve('ipfs'))
      return Path.resolve(path, '..', 'cli', 'bin.js')
    } catch (err) {}
  })(),
  'go-ipfs-dep': (() => {
    try {
      const path = Path.dirname(Path.dirname(require.resolve('go-ipfs-dep')))
      return Path.resolve(path, 'go-ipfs', 'ipfs')
    } catch (err) {}
  })()
})

const defaultExecPath = installedExecPaths['go-ipfs-dep'] || installedExecPaths['ipfs']
const defaultIpfsPath = Path.join(Os.homedir(), '.ipfs')

module.exports = async options => {
  options = options || {}

  const execPath = options.execPath || defaultExecPath
  const ipfsPath = options.ipfsPath || defaultIpfsPath
  const stdout = options.stdout
  const stderr = options.stderr

  if (!execPath) {
    throw new Error('go-ipfs-dep/ipfs not found and no executable path provided')
  }

  if (!(await exists(ipfsPath))) {
    await execInit(execPath, ipfsPath, { stdout, stderr })
  }

  const configPath = Path.join(ipfsPath, 'config')
  let config

  if (options.config) {
    config = await updateConfig(configPath, options.config, options)
  } else {
    config = await readConfig(configPath)
  }

  const proc = execDaemon(execPath, ipfsPath, { args: options.args, stdout, stderr })
  await daemonReady(proc)
  return { process: proc, config }
}

module.exports.installedExecPaths = installedExecPaths

async function exists (path) {
  try {
    await access(path, Fs.constants.F_OK | Fs.constants.W_OK)
  } catch (err) {
    return false
  }
  return true
}

async function execInit (execPath, ipfsPath, options) {
  options = options || {}
  await mkdirp(ipfsPath)
  const proc = execa(execPath, ['init'], { env: { IPFS_PATH: ipfsPath } })
  if (options.stdout) proc.stdout.pipe(options.stdout)
  if (options.stderr) proc.stderr.pipe(options.stderr)
  return proc
}

const defaultMergeOptions = { arrayMerge: (_, sourceArray) => sourceArray }

async function updateConfig (configPath, newConfig, options) {
  options = options || {}
  const prevConfig = await readConfig(configPath)
  const mergeOptions = options.mergeOptions || defaultMergeOptions
  const nextConfig = merge(prevConfig, newConfig, mergeOptions)
  await writeFile(configPath, JSON.stringify(nextConfig, null, 2))
  return nextConfig
}

async function readConfig (path) {
  return JSON.parse(await readFile(path))
}

function execDaemon (execPath, ipfsPath, options) {
  options = options || {}
  const args = ['daemon'].concat(options.args || [])
  const proc = execa(execPath, args, { env: { IPFS_PATH: ipfsPath } })
  if (options.stdout) proc.stdout.pipe(options.stdout)
  if (options.stderr) proc.stderr.pipe(options.stderr)
  return proc
}

async function daemonReady (proc) {
  return Promise.race([
    new Promise((resolve, reject) => {
      let out = ''
      proc.stdout.on('data', function onData (d) {
        out += d
        if (!out.includes('Daemon is ready')) return
        proc.stdout.off('data', onData)
        resolve(out)
      })
    }),
    new Promise((resolve, reject) => proc.catch(reject))
  ])
}
