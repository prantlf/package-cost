## Cost of NPM Packages

[![NPM version](https://badge.fury.io/js/package-cost.png)](http://badge.fury.io/js/package-cost)
[![Build Status](https://github.com/prantlf/package-cost/workflows/Test/badge.svg)](https://github.com/prantlf/package-cost/actions)
[![Dependency Status](https://david-dm.org/prantlf/package-cost.svg)](https://david-dm.org/prantlf/package-cost)
[![devDependency Status](https://david-dm.org/prantlf/package-cost/dev-status.svg)](https://david-dm.org/prantlf/package-cost#info=devDependencies)

Gets tarball and unpacked sizes of NPM packages including its dependencies.

## Synopsis

    $ package-cost plural-rules fast-plural-rules

    plural-rules@1.0.1: 0 dependencies, 52.89 KiB tarball, 0.29 MiB unpacked
    fast-plural-rules@1.0.1: 0 dependencies, 27.36 KiB tarball, 0.13 MiB unpacked

## Installation

You can install this package globally using your favourite Node.js package manager:

```sh
npm i -g package-cost
yarn global add package-cost
pnpm i -g package-cost
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

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Lint and test your code using `npm test`.

## License

Copyright (c) 2021 Ferdinand Prantl

Licensed under the MIT license.
