#!/usr/bin/env node

const { argv } = process
const refs = []
let concurrency, verbose, json

for (let i = 2, l = argv.length; i < l; ++i) {
  const arg = argv[i]
  const match = /^(?:-|--)([a-zA-Z]+)$/.exec(arg)
  if (match) {
    switch (match[1]) {
      case 'c': case 'concurrency':
        concurrency = +argv[++i]
        if (!(concurrency > 0)) {
          console.error(`concurrency not greater than zero: "${argv[i - 1]}"`)
          process.exit(1)
        }
        continue
      case 'j': case 'json':
        json = true
        continue
      case 'v': case 'verbose':
        verbose = true
        continue
      case 'V': case 'version':
        console.log(require('../package.json').version)
        process.exit(0)
      case 'h': case 'help':
        require('./help')()
    }
    console.error(`unknown option: "${match[0]}"`)
    process.exit(1)
  }
  refs.push(arg)
}

if (!refs.length) {
  console.log('No packages provided.\n')
  require('./help')()
}

const estimatePkgs = require('.')
const { formatSize, pluralize } = require('./util')

function printProgress({ name, version, tarballSize, unpackedSize, depCount }, { print }) {
  print(`${name}@${version}: ${pluralize(depCount, 'dependency', 'dependencies')}, ${formatSize(tarballSize)} tarball, ${formatSize(unpackedSize)} unpacked\n`)
}

(async () => {
  try {
    const progress = json ? undefined : printProgress
    const pkgs = await estimatePkgs(refs, { progress, concurrency, verbose })
    if (json) console.log(JSON.stringify(pkgs))
  } catch (err) {
    console.error(verbose ? err : err.message)
    process.exitCode = 1
  }
})()
