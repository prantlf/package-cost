export interface Pkg {
  name: string
  version: string
  tarballSize: integer
  unpackedSize: integer
  depCount: integer
}

export interface Opts {
  progress?: (pkg: Pkg, opts: { print: (text: string) => void }) => void
  concurrency?: integer
  verbose?: boolean
}

export default function estimatePkgs(refs: string[], opts?: Opts): Promise<Pkg[]>
