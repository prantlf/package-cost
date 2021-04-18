# Changes

## 0.3.0

* Let single-letter command-line argument chained in a single argument.
* Compute size of the JavaScript bundle concatenated of the main module export and all its dependencies.
* Compute compressed size of the minified JavaScript bundle.
* Let the extent of the operation to be set to `none` or `all` - a single parameter for the two options below.
* Let the operation be limited to the specified packages only without traversing their dependencies.
* Let the operation print sizes for all package dependencies recursively.
* Let the result be formatted in a table.
* Let the table be sorted by a selected column.
* Reduce the default parallelism to 10.
* Rename `tarballSize` to `tarSize`.
* Rename `unpackedSize` to `rawSize`.
* Rename `concurrency` to `parallel`.
* Execute NPM as a child process. The programmatic interface changed between NPM 6 and 7.

## 0.2.0

Add typings.

## 0.1.0

Expose the package size estimation method as an API.

## 0.0.2

Add shebang to the binary script

## 0.0.1

Initial release.
