export interface Pkg {
  name: string
  version: string
  tarSize: integer
  rawSize: integer
  bundleSize?: integer
  miniSize?: integer
  depCount?: integer
}

export interface Opts {
  progress?: (pkg: Pkg, opts: { print: (text: string) => void }) => void
  concurrency?: integer
  extent?: 'none' | 'all'
  verbose?: boolean
}

export default function estimatePkgSizes(refs: string[], opts?: Opts): Promise<Pkg[]>
