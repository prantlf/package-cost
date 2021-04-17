#!/usr/bin/env node

const { argv } = process
const refs = []
let concurrency, verbose, json

for (let i = 2, l = argv.length; i < l; ++i) {
  const arg = argv[i]
  const match = /^(-|--)([a-zA-Z]+)$/.exec(arg)
  if (match) {
    const args = match[1] === '-' ? match[2].split('') : [match[2]]
    for (const arg of args) {
      switch (arg) {
        case 'c': case 'concurrency':
          concurrency = +argv[++i]
          if (!(concurrency > 0)) {
            console.error(`concurrency not greater than zero: "${argv[i]}"`)
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
    continue
  }
  refs.push(arg)
}

if (!refs.length) {
  console.log('No packages provided.\n')
  require('./help')()
}

const estimatePkgSizes = require('.')
const { formatSize, pluralize } = require('./util')

function printProgress({ name, version, tarSize, rawSize, bundleSize, miniSize, depCount }, { print }) {
  const bundled = bundleSize ? `, ${formatSize(bundleSize)} bundled, ${formatSize(miniSize)} minified` : /* c8 ignore next */ ''
  print(`${name}@${version}: ${pluralize(depCount, 'dependency', 'dependencies')}, ${formatSize(tarSize)} packed, ${formatSize(rawSize)} unpacked${bundled}\n`)
}

(async () => {
  try {
    const progress = json ? undefined : printProgress
    const pkgs = await estimatePkgSizes(refs, { progress, concurrency, verbose })
    if (json) console.log(JSON.stringify(pkgs))
  } catch (err) {
    console.error(verbose ? err : err.message)
    process.exitCode = 1
  }
})()
