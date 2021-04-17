## Cost of NPM Packages

[![NPM version](https://badge.fury.io/js/package-cost.png)](http://badge.fury.io/js/package-cost)
[![Build Status](https://github.com/prantlf/package-cost/workflows/Test/badge.svg)](https://github.com/prantlf/package-cost/actions)
[![Dependency Status](https://david-dm.org/prantlf/package-cost.svg)](https://david-dm.org/prantlf/package-cost)
[![devDependency Status](https://david-dm.org/prantlf/package-cost/dev-status.svg)](https://david-dm.org/prantlf/package-cost#info=devDependencies)

Gets NPM package size - packed, unpacked and script bundle - including dependencies recursively. See [details about the sizes](#how-it-works).

## Synopsis

```txt
$ package-cost plural-rules fast-plural-rules

plural-rules@1.0.1:      0 dependencies, 52.89 KiB packed, 0.29 MiB unpacked,
                         20.58 KiB bundled, 17.15 KiB minified
fast-plural-rules@1.0.1: 0 dependencies, 27.36 KiB packed, 0.13 MiB unpacked,
                         7.96 KiB bundled, 3.64 KiB minified
```

```js
const estimatePkgSizes = require('package-cost')
const pkgs = await estimatePkgSizes(['janadom@^0.1.0'])
// [{"name":"janadom","version":"0.1.2","tarSize":12702,"rawSize":65449,
//   "bundleSize":3815,"miniSize":2410,"depCount":0}]
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
      -c|--concurrency <count>  maximum count of parallel network requests (20)
      -j|--json                 format the results as JSON
      -v|--verbose              print progress details
      -V|--version              print version number
      -h|--help                 print usage instructions

    Examples:
      package-cost plural-rules fast-plural-rules
      package-cost -jv 'build-number-generator@^1.0.0'

## API

### estimatePkgSizes(refs, options)

Returns an array of `pkg` objects with information about the NPM packages.

Arguments:

* `refs`: NPM package references (array of strings)
* `options`: optional object with parameters
  * `progress`: callback to call after estimating every NPM package
  * `concurrency`: maximum count of parallel network requests (interegr, 20 by default)
  * `verbose`: print progress details (boolean, false by default)

The `progress` callback is a `function(pkg, options)`:

* `pkg`: object with package information
* `options`: object with additional information
  * `print`: prints a string to stdout - `function(string)` (console output is disabled when `estimatePkgs` is in progress)

A `pkg` object includes the following properties:

* `name`: name of the package (string)
* `version`: version of the package (string)
* `tarSize`: size of the (packed) package tarball in bytes (integer)
* `rawSize`: size of the unpacked package in bytes (integer)
* `bundleSize`: size of the main exported script with all dependencies (integer)
* `miniSize`: the same as `bundleSize` but after minifying the script (integer)
* `depCount`: count of the package dependencies (integer)

There are [details about the sizes](#how-it-works) below.

## How It Works

NPM packages can be specified in any format that is recognised by `npm v`. They are processed by the following operations:

1. Request the information about the NPM package by `npm v`.
2. Continue requesting the package information for the dependencies of the specified package and that recursively for the whole dependency tree.
3. Collect sizes of tarballs for all requested NPM packages.
4. Stream the tarballs from the network to memory, compute their unpacked sizes and store JavaScript and JSON files in memory.
5. Run a JavaScript bundler against the main exported module of the initially specified package and compute the bundle raw and minified sizes.

Collected sizes have the following meaning:

* `tarSize`: Download size of the package including its dependencies. Measures the project installation overhead. Important for often build container starting in CI/CD pipelines.
* `rawSize`: Unpacked size of the package including its dependencies. Measures the disk space overhead. Important for often container starting in CI/CD pipelines.
* `bundleSize`: Size of the JavaScript bundle concatenated from the main package export and all its dependencies followed recursively. Measures the amount of JavaScript to be parsed. Important for the page loading performance.
* `miniSize`: the same as `bundleSize` but after minifying the JavaScript bundle (integer)

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Lint and test your code using `npm test`.

## License

Copyright (c) 2021 Ferdinand Prantl

Licensed under the MIT license.
