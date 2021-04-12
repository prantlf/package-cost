const assert = require('assert')
const { formatSize, pluralize } = require('../lib/util')

assert.strictEqual(formatSize(1), '1 B')
assert.strictEqual(formatSize(1024), '1.00 KiB')
assert.strictEqual(formatSize(1048576), '1.00 MiB')

assert.strictEqual(pluralize(0, 's', 'p'), '0 p')
assert.strictEqual(pluralize(1, 's', 'p'), '1 s')
