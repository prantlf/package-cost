module.exports = function() {
  console.log(`Gets tarball and unpacked sizes of NPM packages including its dependencies.

Usage: package-cost [option ...] [package ...]

Options:
  -c|--concurrency <count>  maximum count of parallel network requests (20)
  -j|--json                 format the results as JSON
  -v|--verbose              print progress details
  -V|--version              print version number
  -h|--help                 print usage instructions

Examples:
  package-cost plural-rules fast-plural-rules
  package-cost -v 'build-number-generator@^1.0.0'`)
  process.exit(0)
}