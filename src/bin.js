#! /usr/bin/env node

const startIpfsDaemon = require('./')

;(async () => {
  const daemon = await startIpfsDaemon({
    stdout: process.stdout,
    stderr: process.stderr
  })
  await daemon.process
})()
