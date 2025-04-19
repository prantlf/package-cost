## Cost of NPM Packages

[![NPM version](https://badge.fury.io/js/package-cost.png)](http://badge.fury.io/js/package-cost)
[![Build Status](https://github.com/prantlf/package-cost/workflows/Test/badge.svg)](https://github.com/prantlf/package-cost/actions)
[![Dependency Status](https://david-dm.org/prantlf/package-cost.svg)](https://david-dm.org/prantlf/package-cost)
[![devDependency Status](https://david-dm.org/prantlf/package-cost/dev-status.svg)](https://david-dm.org/prantlf/package-cost#info=devDependencies)

Gets NPM package size - packed, unpacked, bundled, compressed - including dependencies recursively. See [details about the sizes](#how-it-works).

## Synopsis

```txt
$ package-cost plural-rules fast-plural-rules

plural-rules@1.0.1:      0 dependencies, 52.89 KiB packed, 0.29 MiB unpacked,
                         20.58 KiB bundled, 17.15 KiB minified,
                         3.62 KiB gzipped, 3.64 KiB deflated, 3.07 KiB brotlied
fast-plural-rules@1.0.1: 0 dependencies, 27.36 KiB packed, 0.13 MiB unpacked,
                         7.96 KiB bundled, 3.64 KiB minified,
                         1.28 KiB gzipped, 1.27 KiB deflated, 1.17 KiB brotlied
```

```js
const { estimatePkgSizes } = require('package-cost')
const pkgs = await estimatePkgSizes(['janadom@^0.1.0'])
// [{"name":"janadom","version":"0.1.2","tarSize":12702,"rawSize":65449,
//   "bundleSize":3815,"miniSize":2410,"gzipSize":1088,"deflateSize":1076,
//   "brotliSize":947,"depCount":0}]
```

## Installation

If you want to use the command-line too, you can install this package globally using your favourite Node.js package manager:

```sh
npm i -g package-cost
yarn global add package-cost
pnpm i -g package-cost
```

If you want to use this package programmatically install it locally:

```sh
npm i package-cost
yarn add package-cost
pnpm i package-cost
```

## Usage

    Usage: package-cost [option ...] [package ...]

    Options:
      -c|--clean-cache         cleans the cache in ~/.cache/package-cost
      -w|--write-cache         writes the package information to cache
      -p|--parallel <count>    maximum count of parallel network requests (10)
      -e|--extent none|all     an alias for the two options below
      -n|--no-recurse          if the dependencies should not be traced
      -a|--analyse-all         if sizes should be computed for all dependencies
      -j|--json                format the results as JSON
      -t|--table               format the results to a table
      -s|--sort <column>       sort the table rows by values in a column
      -d|--direction asc|desc  sort direction (asc by default)
      -v|--verbose             print progress details
      -V|--version             print version number
      -h|--help                print usage instructions

    Examples:
      package-cost plural-rules fast-plural-rules
      package-cost -jv 'build-number-generator@^1.0.0'

## API

### estimatePkgSizes(refs, options)

Returns a promise to an array of `pkg` objects with information about the NPM packages.

Arguments:

* `refs`: NPM package references (array of strings)
* `options`: optional object with parameters
  * `progress`: callback to call after estimating every NPM package
  * `parallel`: maximum count of parallel network requests (integer, 10 by default)
  * `extent`: if or how many dependencies should be printed (string, `none` or `all`)
  * `verbose`: print progress details (boolean, false by default)

The `progress` callback is a `function(pkg, options)`:

* `pkg`: object with package information
* `options`: object with additional information
  * `print`: prints a string to stdout - `function(string)` (console output is disabled when `estimatePkgSizes` is in progress)

A `pkg` object includes the following properties:

* `name`: name of the package (string)
* `version`: version of the package (string)
* `tarSize`: size of the (packed) package tarball in bytes (integer)
* `rawSize`: size of the unpacked package in bytes (integer)
* `bundleSize`: size of the main exported script with all dependencies (integer)
* `miniSize`: the same as `bundleSize` but after minifying the script (integer)
* `gzipSize`: size of the minified bundle after applying the gzip compression (integer)
* `deflateSize`: size of the minified bundle after applying the deflate compression (integer)
* `brotliSize`: size of the minified bundle after applying the brotli compression (integer)
* `depCount`: count of the package dependencies (integer)

There are [details about the sizes](#how-it-works) below.

### cleanCache(options)

Removes the `~/.cache/package-cost` directory and returns a promise for it.

Arguments:

* `options`: optional object with parameters
  * `verbose`: print progress details (boolean, false by default)

### writeCache(options)

Write the package information obtained so far to the `~/.cache/package-cost` directory and returns a promise for it.

Arguments:

* `options`: optional object with parameters
  * `verbose`: print progress details (boolean, false by default)

## How It Works

NPM packages can be specified in any format that is recognised by `npm v`. They are processed by the following operations:

1. Request the information about the NPM package by `npm v`.
2. Continue requesting the package information for the dependencies of the specified package and that recursively for the whole dependency tree.
3. Collect sizes of tarballs for all requested NPM packages.
4. Stream the tarballs from the network to memory, compute their unpacked sizes and store JavaScript and JSON files in memory.
5. Run a JavaScript bundler against the main exported module of the initially specified package and compute the bundle raw, minified and compressed sizes.

If there is package information cached in `~/.cache/package-cost`, it will be used from the cache. The package information collected during the execution can be cached if requested.

Collected sizes have the following meaning:

* `tarSize`: Download size of the package including its dependencies. Measures the project installation overhead. Important for often build container starting in CI/CD pipelines.
* `rawSize`: Unpacked size of the package including its dependencies. Measures the disk space overhead. Important for often container starting in CI/CD pipelines.
* `bundleSize`: Size of the JavaScript bundle concatenated from the main package export and all its dependencies followed recursively. Measures the amount of JavaScript to be parsed. Important for the application loading performance.
* `miniSize`: The same as `bundleSize` but after minifying the JavaScript bundle.
* `gzipSize`: Size of the minified JavaScript bundle after applying the gzip compression. Measures the browser download overhead. Important for the page loading performance.
* `deflateSize`: The same as `gzipSize` but using the deflate compression.
* `brotliSize`: The same as `gzipSize` but using the brotli compression.

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Lint and test your code using `npm test`.

## License

Copyright (c) 2021-2025 Ferdinand Prantl

Licensed under the MIT license.
