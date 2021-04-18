module.exports = function() {
  console.log(`Gets NPM package size - packed, unpacked, bundled, compressed
                      - including dependencies recursively.

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

Table columns are package, deps, packed, unpacked, bundled, minified,
gzipped, deflated and brotlied.

Examples:
  package-cost plural-rules fast-plural-rules
  package-cost -jv 'build-number-generator@^1.0.0'`)
  process.exit(0)
}
