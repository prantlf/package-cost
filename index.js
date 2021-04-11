let concurrency, verbose

const npm = require(`${process.execPath}/../../lib/node_modules/npm`)
const http = require('http')
const https = require('https')
const gunzip = require('gunzip-maybe')
const tar = require('tar-stream')
const { Writable } = require('stream')
const { keys } = Object
const { push } = Array.prototype
const print = process.stdout.write.bind(process.stdout)
const refCache = {}
const pkgCache = {}

function log(text) {
  if (verbose) print(text)
}

function loadNpm() {
  return new Promise((resolve, reject) => {
    npm.load({ loaded: false }, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function inspectPkg(ref) {
  return new Promise((resolve, reject) => {
    const git = ref.indexOf('@git')
    if (git > 0) {
      const cutRef = ref.substr(0, git)
      log(`  Using ${cutRef} instead of ${ref}\n`)
      ref = cutRef
    }
    const id = refCache[ref]
    if (id) resolve(pkgCache[id])
    else {
      log(`    npm v ${ref}\n`)
      npm.commands.v([ref], (err, data) => {
        if (err) reject(err)
        else {
          const versions = keys(data)
          const { name, version, dist, dependencies = {} } = data[versions[versions.length - 1]]
          const { tarball, unpackedSize } = dist
          resolve({ name, version, tarball, unpackedSize, dependencies })
        }
      })
    }
  })
}

function makeRequest(method, url) {
  return new Promise((resolve, reject) => {
    log(`    ${method} ${url}\n`)
    const proto = url.startsWith('http:') ? http : https
    const req = proto
      .request(url, { method })
      .on('response', res => {
        const { statusCode, statusMessage, headers } = res
        if (statusCode === 200) resolve(res)
        else if (statusCode >= 300 && statusCode < 400) {
          res.resume()
          makeRequest(method, headers.location, callback).then(resolve, reject)
        } else reject(new Error(`${url}: ${statusCode} ${statusMessage}`))
      })
      .on('timeout', function () {
        req.abort()
        reject(new Error(`${url}: timeout`))
      })
      .on('error', reject)
    req.end()
  })
}

function measureResponse(res) {
  return new Promise((resolve, reject) => {
    let sum = 0
    const extract = tar
      .extract()
      .on('entry', ({ size }, stream, next) => {
        sum += size
        stream.resume()
        next()
      })
      .on('finish', () => resolve(sum))
      .on('error', reject)
    res
      .on('error', reject)
      .pipe(gunzip())
      .on('error', reject)
      .pipe(extract)
      .on('error', reject)
  })
}

async function inspectTarball(pkg) {
  let { tarball, tarballSize } = pkg
  if (!tarballSize) {
    const { headers } = await makeRequest('HEAD', tarball)
    pkg.tarballSize = +headers['content-length']
  }
}

async function analyseTarball(pkg) {
  const { tarball, unpackedSize } = pkg
  if (!unpackedSize) {
    const res = await makeRequest('GET', tarball)
    pkg.unpackedSize = await measureResponse(res)
  }
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
  writeOut = process.stdout.write
  writeErr = process.stderr.write
  process.stdout.write = process.stderr.write = nul.write.bind(nul)
}

function enableOut() {
  process.stdout.write = writeOut
  process.stderr.write = writeErr
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

module.exports = async function estimatePkgs(refs, { progress, concurrency: c, verbose: v } = {}) {
  concurrency = c || 20
  verbose = v
  disableOut()
  try {
    log('  Loading npm\n')
    await loadNpm()
    const pkgs = []
    for (const ref of refs) {
      const pkg = await estimatePkg(ref)
      pkgs.push(pkg)
      if (progress) progress(pkg, { print })
    }
    return pkgs
  } finally {
    enableOut()
  }
}
