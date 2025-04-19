# Changes

## [0.4.0](https://github.com/prantlf/package-cost/compare/v0.3.0...v0.4.0) (2025-04-19)

### Features

* Upgrade dependencies ([8b98c42](https://github.com/prantlf/package-cost/commit/8b98c42577096bdb4d70fe5b68ed08d7a8de4548))
* Migrade from rmdir to rm ([ae930ae](https://github.com/prantlf/package-cost/commit/ae930ae9bf8f682804d1d8c01b6e5ffe860b878c))

### Bug Fixes

* Ignore an error if the cache directory does not exist ([dca7c1d](https://github.com/prantlf/package-cost/commit/dca7c1dfcd83bb40534cbfb0429b20f1f540f9f7))

### BREAKING CHANGES

The minimum supported version of Node.js is 14.14
from now on. Node.js 12 remains supported by the previous releases.

## 0.3.0 (2021-04-19)

* Let single-letter command-line argument chained in a single argument.
* Compute size of the JavaScript bundle concatenated of the main module export and all its dependencies.
* Compute compressed size of the minified JavaScript bundle.
* Let the extent of the operation to be set to `none` or `all` - a single parameter for the two options below.
* Let the operation be limited to the specified packages only without traversing their dependencies.
* Let the operation print sizes for all package dependencies recursively.
* Let the result be formatted in a table.
* Let the table be sorted by a selected column.
* Optionally cache the once computed package information.
* Reduce the default parallelism to 10.
* Rename `tarballSize` to `tarSize`.
* Rename `unpackedSize` to `rawSize`.
* Rename `concurrency` to `parallel`.
* Execute NPM as a child process. The programmatic interface changed between NPM 6 and 7.

## 0.2.0 (2021-04-12)

Add typings.

## 0.1.0 (2021-04-11)

Expose the package size estimation method as an API.

## 0.0.2 (2021-04-11)

Add shebang to the binary script

## 0.0.1 (2021-04-11)

Initial release.
