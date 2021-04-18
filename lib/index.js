let parellelism, verbose

const { exec } = require('child_process')
const { dirname, join, normalize } = require('path')
const http = require('http')
const https = require('https')
const gunzip = require('gunzip-maybe')
const tar = require('tar-stream')
const { build } = require('esbuild')
const { Writable } = require('stream')
const { gzip, deflate, brotliCompress, constants } = require('zlib')
const { formatSize, pluralize } = require('./util')
const { keys } = Object
const { push } = Array.prototype
const print = process.stdout.write.bind(process.stdout)
const refCache = {}
const pkgCache = {}
let group

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

function exactVersion(ver) {
  return ver.replace(/^\^|~|>=?/, '')
}

function normalizeRef(ref) {
  const at = ref.indexOf('@', 1)
  if (at >= 0) {
    const name = ref.substr(0, at)
    let ver = ref.substr(at + 1)
    const vers = ver.split(/\s*\|\|\s*/) // name@^1.0.0 || ^2.0.0
    if (vers.length > 1) {
      ver = vers.sort((l, r) => -compareVersions( // ^2.0.0, ^1.0.0
        parseVersion(exactVersion(l)), parseVersion(exactVersion(r))))[0]
      ref = `${name}@${ver}` // name@^2.0.0
    }
  }
  return ref
}

function getPkgInfo(ref) {
  return new Promise((resolve, reject) => {
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
    if (id) resolve(pkgCache[id])
    else {
      exec(`npm v ${ref} --json`, { maxBuffer: 16777216 }, (error, stdout) => {
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
          // parellelism of this operation
          const id = `${name}@${version}`
          /* c8 ignore next */
          if (refCache[id]) resolve(pkgCache[id])
          else {
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
  for (let pending = keys(deps); pending.length > 0; pending = pending.slice(parellelism))
    push.apply(allDeps, await Promise.all(
      pending.slice(0, parellelism).reduce((promises, name) => {
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
  for (let pending = allDeps; pending.length > 0; pending = pending.slice(parellelism))
    await Promise.all(pending.slice(0, parellelism).map(({ deps }) => getDepPkgInfos(refs, pkgs, deps)))
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
  chunks = []

  write(chunk, encoding, callback) {
    let buf
    if (chunk instanceof Buffer) buf = chunk
    else if (chunk instanceof Uint8Array) buf = Buffer.from(chunk)
    else if (typeof chunk === 'string') buf = Buffer.from(chunk, encoding || 'utf8')
    else throw new Error('not in object mode')
    this.chunks.push(buf)
    if (callback) setImmediate(callback)
  }

  toString() {
    let { content } = this
    if (!content) {
      content = this.content = Buffer.concat(this.chunks).toString()
      this.chunks = undefined
    }
    return content
  }
}

function measureTarRes(res, pkg) {
  return new Promise((resolve, reject) => {
    const { name, version } = pkg
    const id = `${name}@${version}`
    const scripts = {}
    let rawSize = 0
    const extract = tar
      .extract()
      .on('entry', ({ name, type, size }, stream, next) => {
        rawSize += size
        if (type === 'file' && isScript.test(name)) {
          name = name.replace(/^package\//, '')
          log(`collecting ${id}:${name}`)
          const buf = new StringBuffer()
          scripts[name] = buf
          stream.on('end', next).pipe(buf)
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
      .on('error', reject)
    res
      .on('error', reject)
      .pipe(gunzip())
      .on('error', reject)
      .pipe(extract)
      .on('error', reject)
  })
}

async function analyseTar(pkg) {
  let { tarURL, scripts } = pkg
  if (!scripts) await measureTarRes(await makeHttpRequest('GET', tarURL), pkg)
}

function fromMemory({ name, version, module, scripts, deps }) {
  const id = `${name}@${version}`
  const resolved = {}

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

  function readContents(namespace, path) {
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
      build.onLoad({ filter: /./ }, ({ path, namespace }) => {
        const contents = readContents(namespace, path)
        if (contents) return { contents }
        log(`skipping ${path}`)
        return { contents: '{}' }
      })
    }
  }
}

function compressGzip(input) {
  return new Promise((resolve, reject) => {
    gzip(input, { level: 9 }, (err, buf) => {
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
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_DEFAULT_QUALITY
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

async function estimatePkgSize(ref, recurse) {
  enterLogScope('init')
  log(`inspecting ${ref}`)
  const pkg = await getPkgInfo(ref)
  let { name, version, deps, bundleSize, miniSize, gzipSize, deflateSize, brotliSize } = pkg
  const id = `${name}@${version}`
  const refs = { [ref]: true, [id]: true }
  const pkgs = { [id]: true }
  refCache[name] = refCache[ref] = refCache[id] = id
  if (!pkgCache[id]) pkgCache[id] = pkg
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
  for (let pending = data; pending.length > 0; pending = pending.slice(parellelism))
    await Promise.all(pending.slice(0, parellelism).map(pkg => analyseTar(pkg, id)))
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

module.exports = async function estimatePkgSizes(refs, { progress, parellelism: c, extent, verbose: v } = {}) {
  parellelism = c || 10
  verbose = v
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
