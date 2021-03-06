#!/usr/bin/env node

const { argv } = process
const refs = []
/* c8 ignore start */
const sorts = {
  package: ({ name, version }) => `${name}@${version}`,
  deps: ({ depCount }) => depCount,
  packed: ({ tarSize }) => tarSize,
  unpacked: ({ rawSize }) => rawSize,
  bundled: ({ bundleSize }) => bundleSize,
  minified: ({ miniSize }) => miniSize,
  gzipped: ({ gzipSize }) => gzipSize,
  deflated: ({ deflateSize }) => deflateSize,
  brotlied: ({ brotliSize }) => brotliSize
}
/* c8 ignore end */
let clean, write, parallel, extent, noRecurse, analyseAll, verbose, json, table, sort, direction

for (let i = 2, l = argv.length; i < l; ++i) {
  const arg = argv[i]
  const match = /^(-|--)([a-zA-Z]+)$/.exec(arg)
  if (match) {
    const args = match[1] === '-' ? match[2].split('') : [match[2]]
    for (const arg of args) {
      switch (arg) {
        case 'c': case 'clean-cache':
          clean = true
          continue
        case 'w': case 'write-cache':
          write = true
          continue
        case 'p': case 'parallel':
          parallel = +argv[++i]
          if (!(parallel > 0)) {
            console.error(`parallel not greater than zero: "${argv[i]}"`)
            process.exit(1)
          }
          continue
        case 'e': case 'extent':
          extent = argv[++i]
          if (extent !== 'none' && extent !== 'all') {
            console.error(`invalid extent: "${argv[i]}"`)
            process.exit(1)
          }
          continue
        case 'n': case 'no-recurse':
          noRecurse = true
          continue
        case 'a': case 'analyse-all':
          analyseAll = true
          continue
        case 'j': case 'json':
          json = true
          continue
        case 't': case 'table':
          table = true
          continue
        case 's': case 'sort':
          sort = argv[++i]
          if (!sorts[sort]) {
            console.error(`invalid sort column: "${argv[i]}"`)
            process.exit(1)
          }
          continue
        case 'd': case 'direction':
          direction = argv[++i]
          if (direction !== 'asc' && direction !== 'desc') {
            console.error(`invalid sort direction: "${argv[i]}"`)
            process.exit(1)
          }
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

const { estimatePkgSizes, cleanCache, writeCache } = require('.')

if (!refs.length) {
  if (clean)
    (async () => {
      try {
        await cleanCache()
      } catch (err) {
        console.error(verbose ? err : err.message)
        process.exitCode = 1
      }
    })()
  else {
    console.log('No packages provided.\n')
    require('./help')()
  }
} else {
  const { formatSize, pluralize } = require('./util')

  function padSize(size) {
    return formatSize(size).padEnd(9)
  }

  function printProgress({ name, version, tarSize, rawSize, bundleSize, miniSize, gzipSize, deflateSize, brotliSize, depCount }, { print }) {
    const deps = depCount !== undefined ? `${pluralize(depCount, 'dependency', 'dependencies')}, ` : /* c8 ignore next */ ''
    const bundled = bundleSize ? `, ${formatSize(bundleSize)} bundled, ${formatSize(miniSize)} minified, ${formatSize(gzipSize)} gzipped, ${formatSize(deflateSize)} deflated, ${formatSize(brotliSize)} brotlied` : /* c8 ignore next */ ''
    print(`${name}@${version}: ${deps}${formatSize(tarSize)} packed, ${formatSize(rawSize)} unpacked${bundled}\n`)
  }

  function printTable(pkgs) {
    let maxLen = 7, maxDeps = 4
    for (const { name, version, depCount } of pkgs) {
      const len = `${name}@${version}`.length
      if (maxLen < len) maxLen = len
      const deps = String(depCount).length
      /* c8 ignore next */
      if (maxDeps < deps) maxDeps = deps
    }
    console.log(`${'package'.padEnd(maxLen)}  ${'deps'.padEnd(maxDeps)}  packed     unpacked   bundled    minified   gzipped    deflated   brotlied`)
    if (sort) {
      const sorter = sorts[sort]
      /* c8 ignore start */
      const dir = direction !== 'desc' ? 1 : -1
      pkgs = pkgs.sort((left, right) => sorter(left) < sorter(right) ? -dir : sorter(left) > sorter(right) ? dir : 0)
      /* c8 ignore end */
    }
    for (const { name, version, tarSize, rawSize, bundleSize, miniSize, gzipSize, deflateSize, brotliSize, depCount } of pkgs) {
      const id = `${name}@${version}`
      /* c8 ignore start */
      const deps = depCount !== undefined ? String(depCount).padEnd(maxDeps) : ' '.repeat(maxDeps)
      const bundled = bundleSize ? `${padSize(bundleSize)}  ${padSize(miniSize)}  ${padSize(gzipSize)}  ${padSize(deflateSize)}  ${padSize(brotliSize)}` : ''
      /* c8 ignore end */
      console.log(`${id.padEnd(maxLen)}  ${deps}  ${padSize(tarSize)}  ${padSize(rawSize)}  ${bundled}`)
    }
  }

  (async () => {
    try {
      const progress = json || table ? undefined : printProgress
      if (extent === undefined) extent = noRecurse ? 'none' : analyseAll ? 'all' : undefined
      if (clean) await cleanCache({ verbose })
      const pkgs = await estimatePkgSizes(refs, { progress, parallel, extent, verbose })
      if (write) await writeCache({ verbose })
      if (json) console.log(JSON.stringify(pkgs))
      else if (table) printTable(pkgs)
    } catch (err) {
      console.error(verbose ? err : err.message)
      process.exitCode = 1
    }
  })()
}
