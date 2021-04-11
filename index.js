const { argv } = process
const refs = []
let concurrency = 20
let verbose, json

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
        console.log(require('./package.json').version)
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

const npm = require(`${process.execPath}/../../lib/node_modules/npm`)
const http = require('http')
const https = require('https')
const gunzip = require('gunzip-maybe')
const tar = require('tar-stream')
const { Writable } = require('stream')
const { promisify } = require('util')
const { keys, values } = Object
const { push } = Array.prototype
const print = process.stdout.write.bind(process.stdout)
const refCache = {}
const pkgCache = {}

function log(text) {
  if (verbose) print(text)
}

const loadNpm = promisify(function (callback) {
  npm.load({ loaded: false }, err => {
    if (err) callback(err)
    else callback()
  })
})

const inspectPkg = promisify(function (ref, callback) {
  const git = ref.indexOf('@git')
  if (git > 0) {
    const cutRef = ref.substr(0, git)
    log(`  Using ${cutRef} instead of ${ref}\n`)
    ref = cutRef
  }
  const id = refCache[ref]
  if (id) return callback(null, pkgCache[id])
  log(`    npm v ${ref}\n`)
  npm.commands.v([ref], (err, data) => {
    if (err) callback(err)
    else {
      const versions = keys(data)
      const { name, version, dist, dependencies = {} } = data[versions[versions.length - 1]]
      const { tarball, unpackedSize } = dist
      callback(null, { name, version, tarball, unpackedSize, dependencies })
    }
  })
})

const makeRequest = promisify(function (method, url, callback) {
  log(`    ${method} ${url}\n`)
  const proto = url.startsWith('http:') ? http : https
  const req = proto
    .request(url, { method })
    .on('response', res => {
      const { statusCode, statusMessage, headers } = res
      if (statusCode === 200) {
        callback(null, res)
      } else if (statusCode >= 300 && statusCode < 400) {
        res.resume()
        makeRequest(method, headers.location, callback)
      } else {
        callback(new Error(`${url}: ${statusCode} ${statusMessage}`))
      }
    })
    .on('timeout', function () {
      req.abort()
      callback(new Error(`${url}: timeout`))
    })
    .on('error', callback)
  req.end()
})

const measureResponse = promisify(function (res, callback) {
  let sum = 0
  const extract = tar
    .extract()
    .on('entry', ({ size }, stream, next) => {
      sum += size
      stream.resume()
      next()
    })
    .on('finish', () => callback(null, sum))
    .on('error', callback)
  res
    .on('error', callback)
    .pipe(gunzip())
    .on('error', callback)
    .pipe(extract)
    .on('error', callback)
})

async function inspectTarball(pkg) {
  let { tarball, tarballSize } = pkg
  if (tarballSize) return
  const { headers } = await makeRequest('HEAD', tarball)
  pkg.tarballSize = +headers['content-length']
}

async function analyseTarball(pkg) {
  const { tarball, unpackedSize } = pkg
  if (unpackedSize) return
  const res = await makeRequest('GET', tarball)
  pkg.unpackedSize = await measureResponse(res)
}

async function inspectDeps(refs, pkgs, dependencies) {
  const allDeps = []
  for (let pending = keys(dependencies); pending.length > 0; pending = pending.slice(concurrency))
    push.apply(allDeps, await Promise.all(
      pending.slice(0, concurrency).reduce((promises, name) => {
        const ref = `${name}@${dependencies[name]}`
        if (!refs[ref]) {
          refs[ref] = true
          const id = refCache[ref]
          if (id) {
            refs[id] = pkgs[id] = true
            promises.push(pkgCache[id])
          } else {
            promises.push(inspectPkg(ref).then(pkg => {
              const { name, version } = pkg
              const id = `${name}@${version}`
              refs[id] = pkgs[id] = true
              refCache[ref] = refCache[id] = id
              return pkgCache[id] = pkg
            }))
          }
        }
        return promises
      }, [])))
  for (let pending = allDeps; pending.length > 0; pending = pending.slice(concurrency))
    await Promise.all(
      pending.slice(0, concurrency).map(({ dependencies }) => inspectDeps(refs, pkgs, dependencies)))
}

function disableOut() {
  const nul = new Writable({
  	write(chunk, encoding, callback) {
  		setImmediate(callback)
  	}
  })
  process.stdout.write = process.stderr.write = nul.write.bind(nul)
}

function formatSize(size) {
  const kb = size / 1024
  return kb > 0 ? kb > 99 ? `${(size / 1048576).toFixed(2)} MiB` :
    `${kb.toFixed(2)} KiB` : `${size} B`
}

function pluralize(count, singular, plural) {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`
}

async function estimatePkg(ref) {
log(`  Inspecting ${ref}\n`)
  const pkg = await inspectPkg(ref)
  const { name, version, dependencies } = pkg
  const id = `${name}@${version}`
  const refs = { [ref]: true, [id]: true }
  const pkgs = { [id]: true }
  refCache[ref] = refCache[id] = id
  if (!pkgCache[id]) pkgCache[id] = pkg
  log('  Tracking dependencies\n')
  await inspectDeps(refs, pkgs, dependencies)
  const data = keys(pkgs).map(id => pkgCache[id])
  const depCount = data.length - 1
  log(`  Found ${pluralize(depCount, 'dependency', 'dependencies')}\n`)
  log('  Getting tarball sizes\n')
  for (let pending = data; pending.length > 0; pending = pending.slice(concurrency))
    await Promise.all(pending.slice(0, concurrency).map(pkg => inspectTarball(pkg)))
  log('  Completing unpacked sizes\n')
  for (let pending = data; pending.length > 0; pending = pending.slice(concurrency))
    await Promise.all(pending.slice(0, concurrency).map(pkg => analyseTarball(pkg)))
  const tarballSize = data.reduce((sum, { tarballSize }) => sum + tarballSize, 0)
  const unpackedSize = data.reduce((sum, { unpackedSize }) => sum + unpackedSize, 0)
  return { name, version, tarballSize, unpackedSize, depCount }
}

(async () => {
  disableOut()
  try {
    log('  Loading npm\n')
    await loadNpm()
    const pkgs = []
    for (const ref of refs) {
      const pkg = await estimatePkg(ref)
      if (json) pkgs.push(pkg)
      else {
        const { name, version, tarballSize, unpackedSize, depCount } = pkg
        print(`${name}@${version}: ${pluralize(depCount, 'dependency', 'dependencies')}, ${formatSize(tarballSize)} tarball, ${formatSize(unpackedSize)} unpacked\n`)
      }
    }
    if (json) print(JSON.stringify(pkgs))
  } catch (err) {
    print(`${err}\n`)
    process.exitCode = 1
  }
})()
