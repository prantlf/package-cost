let parallelism, verbose

const { exec } = require('child_process')
const { constants: fs, createReadStream, createWriteStream } = require('fs')
const { access, mkdir, rm } = require('fs/promises')
const { dirname, join, normalize } = require('path')
const os = require('os')
const http = require('http')
const https = require('https')
const { extract, pack } = require('tar-stream')
const { build } = require('esbuild')
const { pipeline, Readable, Writable } = require('stream')
const { brotliCompress, constants: zlib, createGunzip, createGzip, deflate, gzip } = require('zlib')
const { promisify } = require('util')
const { formatSize, pluralize } = require('./util')

const { keys, values } = Object
const { push } = Array.prototype
const pipe = promisify(pipeline)
const print = process.stdout.write.bind(process.stdout)

const cacheDir = join(os.homedir(), '.cache/package-cost')
const refPath = join(cacheDir, '_refs.json.gz')
const pkgCache = {}
let refCache, group

function enterLogScope(scope) {
  group = scope
}

function log(text, scope) {
  if (verbose) print(`[${(scope || group)}]  ${text}\n`)
}

const isScript =  /\.(?:js|json|mjs)$/

function parseVersion(ver) {
  const [major, minor, patch] = ver.split('.')
  return [+major, +minor, +patch]
}

function compareVersions([lma, lmi, lpa], [rma, rmi, rpa]) {
  /* c8 ignore start */
  return lma < rma ? -1 : lma > rma ? 1 :
    lmi < rmi ? -1 : lmi > rmi ? 1 :
    lpa < rpa ? -1 : lpa > rpa ? 1 : 0
  /* c8 ignore end */
}

function focusVersion(ver) {
  return ver.replace(/^\^|~|>=?/, '')
}

function extractName(ref) {
  const at = ref.indexOf('@', 1)
  return at >= 0 ? ref.substr(0, at) : ref
}

function extractVersion(ref) {
  return ref.substr(ref.indexOf('@', 1) + 1)
}

function normalizeRef(ref) {
  const at = ref.indexOf('@', 1)
  if (at >= 0) {
    const name = ref.substr(0, at)
    let ver = ref.substr(at + 1)
    const vers = ver.split(/\s*\|\|\s*/) // name@^1.0.0 || ^2.0.0
    if (vers.length > 1) {
      ver = vers.sort((l, r) => -compareVersions( // ^2.0.0, ^1.0.0
        parseVersion(focusVersion(l)), parseVersion(focusVersion(r))))[0]
      ref = `${name}@${ver}` // name@^2.0.0
    }
  }
  return ref
}

async function getCachedPkg(id) {
  let pkg = pkgCache[id]
  if (!pkg) {
    const infoPath = join(cacheDir, `${escapeFileName(id)}.json.gz`)
    const buf = new StringBuffer()
    await pipe(createReadStream(infoPath), createGunzip(), buf)
    pkg = pkgCache[id] = JSON.parse(buf.toString())
  }
  return pkg
}

function getPkgInfo(ref) {
  return new Promise(async (resolve, reject) => {
    ref = normalizeRef(ref)
    let notVer = ref.indexOf('@git')
    if (notVer < 0) notVer = ref.indexOf('@>')
    if (notVer < 0) notVer = ref.indexOf('@*')
    if (notVer > 0) {
      const cutRef = ref.substr(0, notVer)
      log(`using ${cutRef} instead of ${ref}`, 'warn')
      ref = cutRef
    }
    // Reuse already inspected packages.
    const id = refCache[ref]
    if (id) getCachedPkg(id).then(resolve, reject)
    else {
      exec(`npm v ${ref} --json`, { maxBuffer: 16777216 }, async (error, stdout) => {
        if (error) reject(error)
        /* c8 ignore next */
        else if (!stdout) reject(new Error(`unknown package ${ref}`))
        else {
          let data = JSON.parse(stdout)
          // If multiple versions are returned, choose the most resent one.
          if (Array.isArray(data)) {
            data.forEach(data => data.parsedVer = parseVersion(data.version))
            data = data.sort(({ parsedVer: l }, { parsedVer: r }) => -compareVersions(l, r))[0]
          }
          let { name, version, dist, dependencies: deps = {}, peerDependencies, main, module } = data
          // Reuse packages inspected a little earlier because of the high
          // parallelism of this operation
          const id = `${name}@${version}`
          /* c8 ignore next */
          if (refCache[id]) {
            refCache[name] = refCache[ref] = refCache[id] = id
            getCachedPkg(id).then(resolve, reject)
          } else {
            /* c8 ignore start */
            module = normalize(module || main || 'index.js')
            if (ref !== id) {
              const at = ref.indexOf('@');
              log(`inspected ${id} by ${at ? ref.substr(at + 1) : ref} (${module})`)
            } else log(`inspected ${ref} (${module})`)
            /* c8 ignore end */
            // Simulate the complete installation where the main project
            // would have to include the peer dependencies too.
            Object.assign(deps, peerDependencies)
            for (const dep in deps) log(`  ${dep}@${deps[dep]}`)
            const { tarball: tarURL, rawSize } = dist
            const pkg = pkgCache[id] = { name, version, tarURL, rawSize, deps, module }
            refCache[name] = refCache[ref] = refCache[id] = id
            resolve(pkg)
          }
        }
      })
    }
  })
}

async function getDepPkgInfos(refs, pkgs, deps) {
  const allDeps = []
  for (let pending = keys(deps); pending.length > 0; pending = pending.slice(parallelism))
    push.apply(allDeps, await Promise.all(
      pending.slice(0, parallelism).reduce((promises, name) => {
        const ref = `${name}@${deps[name]}`
        // Request getting the package information only for not yet visited
        // packages.
        if (!refs[ref]) {
          refs[ref] = true
          const id = refCache[ref]
          if (id) {
            // Just mark the package as visited if the reference points
            // to an already enquired package version.
            refs[id] = pkgs[id] = true
            promises.push(getCachedPkg(id))
          } else {
            promises.push(getPkgInfo(ref).then(pkg => {
              const { name, version } = pkg
              const id = `${name}@${version}`
              refs[id] = pkgs[id] = true
              return pkg
            }))
          }
        }
        return promises
      }, [])))
  for (let pending = allDeps; pending.length > 0; pending = pending.slice(parallelism))
    await Promise.all(pending.slice(0, parallelism).map(({ deps }) => getDepPkgInfos(refs, pkgs, deps)))
}

function makeHttpRequest(method, url) {
  return new Promise((resolve, reject) => {
    log(`${url}`, 'http')
    /* c8 ignore start */
    const proto = url.startsWith('http:') ? http : https
    /* c8 ignore end */
    const req = proto
      .request(url, { method })
      .on('response', res => {
        const { statusCode, statusMessage, headers } = res
        if (statusCode === 200) resolve(res)
        /* c8 ignore start */
        else if (statusCode >= 300 && statusCode < 400) {
          res.resume()
          makeHttpRequest(method, headers.location).then(resolve, reject)
        } else reject(new Error(`${url}: ${statusCode} ${statusMessage}`))
      })
      .on('timeout', function () {
        req.abort()
        reject(new Error(`${url}: timeout`))
      })
      /* c8 ignore end */
      .on('error', reject)
    req.end()
  })
}

class StringBuffer extends Writable {
  _chunks = []

  get buffer() {
    let { _buf } = this
    if (!_buf) {
      _buf = this._buf = Buffer.concat(this._chunks)
      this._chunks = undefined
    }
    return _buf
  }

  write(chunk, encoding, callback) {
    let buf
    if (chunk instanceof Buffer) buf = chunk
    else if (chunk instanceof Uint8Array) buf = Buffer.from(chunk)
    else if (typeof chunk === 'string') buf = Buffer.from(chunk, encoding || 'utf8')
    else throw new Error('not in object mode')
    this._chunks.push(buf)
    if (callback) setImmediate(callback)
  }

  toString() {
    return this._str || (this._str = this.buffer.toString())
  }
}

function measureTarRes(res, pkg) {
  return new Promise((resolve, reject) => {
    const { name, version } = pkg
    const id = `${name}@${version}`
    const scripts = {}
    let rawSize = 0
    const untar = extract()
      .on('entry', ({ name, type, size }, stream, next) => {
        rawSize += size
        if (type === 'file' && isScript.test(name)) {
          name = name.replace(/^package\//, '')
          log(`collecting ${id}:${name}`)
          const buf = scripts[name] = new StringBuffer()
          pipe(stream, buf).then(next, reject)
        } else {
          log(`ignoring ${id}:${name}`)
          stream.on('end', next).resume()
        }
      })
      .on('finish', () => {
        const tarSize = pkg.tarSize = +res.headers['content-length']
        pkg.rawSize = rawSize
        pkg.scripts = scripts
        log(`${id}: ${formatSize(tarSize)} packed, ${formatSize(rawSize)} unpacked, ${pluralize(keys(scripts).length, 'script', 'scripts')}`)
        resolve()
      })
    pipe(res, createGunzip(), untar).catch(reject)
  })
}

async function analyseTar(pkg) {
  let { tarURL, scripts } = pkg
  if (scripts) {
    if (Array.isArray(scripts)) await readScripts(pkg)
  } else await measureTarRes(await makeHttpRequest('GET', tarURL), pkg)
}

async function analyseTars(pkgs) {
  for (let pending = pkgs; pending.length > 0; pending = pending.slice(parallelism))
    await Promise.all(pending.slice(0, parallelism).map(pkg => analyseTar(pkg)))
}

function findScript(path, scripts) {
  let script = scripts[path]
  if (!script) {
    let alt = `${path}.mjs`
    if ((script = scripts[alt])) return [alt, script]
    alt = `${path}.js`
    if ((script = scripts[alt])) return [alt, script]
    alt = join(path, 'index.mjs')
    if ((script = scripts[alt])) return [alt, script]
    alt = join(path, 'index.js')
    if ((script = scripts[alt])) return [alt, script]
  }
  return [path, script]
}

function fromMemory({ name, version, module, scripts, deps }) {
  const id = `${name}@${version}`
  const resolved = {}

  function resolveImport(path, importer, scope) {
    let script
    if (path.startsWith('./') || path.startsWith('../')) {
      if (!(importer && scope)) {
         // The relative path prefix can be just cut away if the path
         // points to the main module exported of the enquired package.
        ([path, script] = findScript(normalize(path), scripts))
        if (script) return { path, namespace: id }
        else log(`${path} missing in the package`, 'warn')
      } else {
        // Resolve the relative path against the module that it is being
        // imported from and cut the path prefix, because script paths
        // in cached packages do not start with "./".
        path = normalize(join(dirname(importer), path))
        const namespace = refCache[scope]
        if (namespace) {
          const { module, scripts } = pkgCache[namespace]
          if (path === '.' || path === './') path = module;
          ([path, script] = findScript(path, scripts))
          if (script) return { path, namespace }
          else log(`${path} missing in scripts of ${namespace}`, 'warn')
        } else {
          log(`${scope}@${path} missing in cache`, 'warn')
        }
      }
    } else {
      if (!(importer && scope)) {
        // A path not starting with "./" has to exist among the scripts
        // if this is the main module exported of the enquired package.
        ([path, script] = findScript(path, scripts))
        if (script) return { path, namespace: id }
        else log(`${path} missing in the package`, 'warn')
      } else {
        // A path not starting with "./" has to start with a module name
        // that the enquired module depends on.
        const dir = path[0] === '@' ? path.replace(/^(@[^/]+\/[^/]+).*$/, '$1')
          : path.replace(/^([^/]+).*$/, '$1')
        let version = deps[dir]
        if (!version) {
          // If the required module is missing in the enquired module
          // dependencies, be desperate and try if this package works
          // "by accident" because the required module got included via
          // some other dependency.
          const namespace = refCache[dir]
          if (namespace) {
            // log(`${dir} missing in dependencies of ${namespace}`, 'warn');
            ({ version } = pkgCache[namespace])
          }
        }
        if (version) {
          const namespace = refCache[`${dir}@${version}`]
          if (namespace) {
            let { module, scripts } = pkgCache[namespace]
            if (dir == path) {
              const pkg = scripts['package.json']
              if (pkg) {
                let { module: module2, main: main2 } = JSON.parse(pkg)
                module2 = normalize(module2 || main2 || 'index.js')
                if (module != module2) {
                  log(`${scope} exports ${module2} instead of ${module}`, 'warn')
                  module = module2 // @marko/compiler
                }
              }
              path = module
            } else {
              path = path.substr(dir.length + 1)
            }
            ([path, script] = findScript(path, scripts))
            if (script) return { path, namespace }
          }
        }
      }
    }
    return { path, namespace: '?', external: true }
  }

  async function readContents(namespace, path) {
    const contents = pkgCache[namespace].scripts[path].toString()
    return path.endsWith('.json') ? `export default ${JSON.stringify(JSON.parse(contents))}` : contents
  }

  return {
    name: 'buffered',
    setup(build) {
      build.onResolve({ filter: /./ }, ({ path: location, importer, namespace: scope }) => {
        const { path, namespace, external } = resolveImport(location, importer, scope)
        const id = `${namespace}@${path}`
        if (!resolved[id]) {
          resolved[id] = true
          if (external) log(`excluding ${namespace}:${path}`)
          else log(`including ${namespace}:${path}`)
        }
        return { path, namespace, external }
      })
      build.onLoad({ filter: /./ }, async ({ path, namespace }) => {
        const contents = await readContents(namespace, path)
        if (contents) return { contents }
        log(`skipping ${path}`)
        return { contents: '{}' }
      })
    }
  }
}

function compressGzip(input) {
  return new Promise((resolve, reject) => {
    gzip(input, { level: -1 }, (err, buf) => {
      /* c8 ignore next */
      if (err) reject(err)
      else resolve(buf.length)
    })
  })
}

function compressDeflate(input) {
  return new Promise((resolve, reject) => {
    deflate(input, { level: -1 }, (err, buf) => {
      /* c8 ignore next */
      if (err) reject(err)
      else resolve(buf.length)
    })
  })
}

function compressBrotli(input) {
  return new Promise((resolve, reject) => {
    const opts = {
      params: {
        [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
        [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_DEFAULT_QUALITY
      }
    }
    brotliCompress(input, opts, (err, buf) => {
      /* c8 ignore next */
      if (err) reject(err)
      else resolve(buf.length)
    })
  })
}

async function assessBundle(pkg) {
  const { module, scripts, nomain, bundleSize } = pkg
  if (nomain || bundleSize) return
  const [, script] = findScript(normalize(module), scripts)
  if (!script) {
    pkg.nomain = true
    return
  }
  try {
    const bundle = (await build({
      entryPoints: [pkg.module],
      format: 'esm',
      bundle: true,
      write: false,
      plugins: [fromMemory(pkg)],
      logLevel: 'silent'
    })).outputFiles[0].text
    const minified = (await build({
      stdin: { contents: bundle },
      write: false,
      minify: true,
      logLevel: 'silent'
    })).outputFiles[0].text
    pkg.bundleSize = bundle.length
    pkg.miniSize = minified.length;
    ([pkg.gzipSize, pkg.deflateSize, pkg.brotliSize] = await Promise.all([
      compressGzip(minified), compressDeflate(minified), compressBrotli(minified)]))
  } catch (err) {
    for (const line of err.toString().split(/\r?\n/)) log(line, 'fail')
  }
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

async function exists(path) {
  try {
    await access(path, fs.R_OK);
    return true
  } catch {}
}

async function loadRefs() {
  if (await exists(refPath)) {
    log('loading cached references')
    const buf = new StringBuffer()
    await pipe(createReadStream(refPath), createGunzip(), buf)
    refCache = JSON
      .parse(buf.toString())
      .refs
      .reduce((result, ref) => {
        if (Array.isArray(ref)) {
          const [name, ver] = ref
          result[name] = `${extractName(name)}@${ver}`
        } else result[ref] = ref
        return result
      }, {})
  } else refCache = {}
}

async function saveRefs() {
  log('saving cached references')
  const refs = keys(refCache).map(ref => {
    const id = refCache[ref]
    if (ref === id) return ref
    return [ref, extractVersion(id)]
  })
  await pipe(Readable.from(JSON.stringify({ version: 1, refs })), createGzip({ level: 9 }), createWriteStream(refPath))
}

function escapeFileName(path) {
  return path.replace(/\/|\\/g, '#')
}

function readScripts(pkg) {
  return new Promise((resolve, reject) => {
    const scripts = {}
    const untar = extract()
      .on('entry', ({ name }, stream, next) => {
        name = name.replace(/^scripts\//, '')
        const buf = scripts[name] = new StringBuffer()
        pipe(stream, buf).then(next, reject)
      })
      .on('finish', () => {
        pkg.scripts = scripts
        resolve()
      })
    const { name, version } = pkg
    const id = `${name}@${version}`
    log(`reading ${id}`)
    pipe(createReadStream(`${join(cacheDir, escapeFileName(id))}.tar.gz`), createGunzip(), untar)
      .catch(err => reject(err))
  })
}

function writeScript(pack, path, buf) {
  return new Promise((resolve, reject) => {
    pack.entry({ name: `scripts/${path}` }, buf.buffer, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

async function updateCachedPkg(pkg) {
  const { name, version, scripts } = pkg
  const id = `${name}@${version}`
  const pkgPath = join(cacheDir, `${escapeFileName(id)}.json.gz`)
  if (await exists(pkgPath)) return
  log(`writing ${id}`)
  const promises = []
  if (scripts && keys(scripts).length > 0) {
    const tar = pack()
    promises.push(pipe(tar, createGzip({ level: 9 }), createWriteStream(`${join(cacheDir, escapeFileName(id))}.tar.gz`)))
    const paths = pkg.scripts = keys(scripts)
    for (const path of paths) await writeScript(tar, path, scripts[path])
    tar.finalize()
  }
  promises.push(pipe(Readable.from(JSON.stringify(pkg)), createGzip({ level: 9 }), createWriteStream(pkgPath)))
  await Promise.all(promises)
}

async function updateCachedPkgs() {
  log('saving cached packages')
  await Promise.all(values(pkgCache).map(updateCachedPkg))
}

async function cleanCache({ verbose: v } = {}) {
  verbose = v
  enterLogScope('load')
  log('cleaning cache')
  await rm(cacheDir, { force: true, recursive: true })
}

async function writeCache({ verbose: v } = {}) {
  verbose = v
  enterLogScope('save')
  await mkdir(cacheDir, { recursive: true })
  await updateCachedPkgs()
  await saveRefs()
}

async function estimatePkgSize(ref, recurse) {
  enterLogScope('init')
  log(`inspecting ${ref}`)
  const pkg = await getPkgInfo(ref)
  let { name, version, deps, bundleSize, miniSize, gzipSize, deflateSize, brotliSize } = pkg
  const id = `${name}@${version}`
  const refs = { [ref]: true, [id]: true }
  const pkgs = { [id]: true }
  let data, depCount
  if (recurse) {
    enterLogScope('deps')
    log('tracking dependencies')
    await getDepPkgInfos(refs, pkgs, deps)
    data = keys(pkgs).map(id => pkgCache[id])
    depCount = data.length - 1
    log(`found ${pluralize(depCount, 'dependency', 'dependencies')}`)
  } else data = [pkg]
  enterLogScope('pack')
  log('analysing tarballs')
  await analyseTars(data)
  const tarSize = data.reduce((sum, { tarSize }) => sum + tarSize, 0)
  const rawSize = data.reduce((sum, { rawSize }) => sum + rawSize, 0)
  if (recurse && !bundleSize) {
    enterLogScope('dist')
    log('computing bundle sizes')
    await assessBundle(pkg);
    ({ bundleSize, miniSize, gzipSize, deflateSize, brotliSize } = pkg)
  }
  return { name, version, tarSize, rawSize, bundleSize, miniSize, gzipSize, deflateSize, brotliSize, depCount }
}

async function estimatePkgSizes(refs, { progress, parallelism: c, extent, verbose: v } = {}) {
  parallelism = c || 10
  verbose = v
  enterLogScope('load')
  await loadRefs()
  disableOut()
  try {
    const pkgs = []
    const ids = {}
    for (const ref of refs) {
      const pkg = await estimatePkgSize(ref, extent !== 'none')
      const { name, version } = pkg
      const id = `${name}@${version}`
      if (!ids[id]) {
        ids[id] = true
        pkgs.push(pkg)
        if (progress) progress(pkg, { print })
      }
    }
    if (extent === 'all') {
      for (const id in pkgCache) {
        if (!ids[id]) {
          const pkg = await estimatePkgSize(id, true)
          pkgs.push(pkg)
          if (progress) progress(pkg, { print })
        }
      }
    }
    return pkgs
  } finally {
    enableOut()
  }
}

module.exports = { estimatePkgSizes, cleanCache, writeCache }
