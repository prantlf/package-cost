export interface Pkg {
  name: string
  version: string
  tarSize: integer
  rawSize: integer
  bundleSize?: integer
  miniSize?: integer
  gzipSize?: integer
  deflateSize?: integer
  brotliSize?: integer
  depCount?: integer
}

export interface CommonOpts {
  verbose?: boolean
}

export interface Opts extends CommonOpts {
  progress?: (pkg: Pkg, opts: { print: (text: string) => void }) => void
  parallel?: integer
  extent?: 'none' | 'all'
}

export function estimatePkgSizes(refs: string[], opts?: Opts): Promise<Pkg[]>
export function cleanCache(opts?: CommonOpts): Promise<void>
export function writeCache(opts?: CommonOpts): Promise<void>
