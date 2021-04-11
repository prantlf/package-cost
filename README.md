## Cost of NPM Packages

[![NPM version](https://badge.fury.io/js/package-cost.png)](http://badge.fury.io/js/package-cost)
[![Build Status](https://github.com/prantlf/package-cost/workflows/Test/badge.svg)](https://github.com/prantlf/package-cost/actions)
[![Dependency Status](https://david-dm.org/prantlf/package-cost.svg)](https://david-dm.org/prantlf/package-cost)
[![devDependency Status](https://david-dm.org/prantlf/package-cost/dev-status.svg)](https://david-dm.org/prantlf/package-cost#info=devDependencies)

Gets tarball and unpacked sizes of NPM packages including its dependencies.

## Synopsis

```txt
$ package-cost plural-rules fast-plural-rules

plural-rules@1.0.1: 0 dependencies, 52.89 KiB tarball, 0.29 MiB unpacked
fast-plural-rules@1.0.1: 0 dependencies, 27.36 KiB tarball, 0.13 MiB unpacked
```

```js
const estimatePkgs = require('package-cost')
const pkgs = await estimatePkgs(['janadom@^0.1.0'])
// [{name:"janadom",version:"0.1.2",tarballSize:12702,unpackedSize:65449,depCount:0}]
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
      package-cost -v 'build-number-generator@^1.0.0'

## API

### estimatePkgs(refs, options)

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
* `tarballSize`: size of the package tarball in bytes (integer)
* `unpackedSize`: size of the unpacked package in bytes (integer)
* `depCount`: count of the package dependencies (integer)

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Lint and test your code using `npm test`.

## License

Copyright (c) 2021 Ferdinand Prantl

Licensed under the MIT license.
