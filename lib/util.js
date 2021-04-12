function formatSize(size) {
  const kb = size / 1024
  return kb >= 1 ? kb > 99 ? `${(size / 1048576).toFixed(2)} MiB` :
    `${kb.toFixed(2)} KiB` : `${size} B`
}

function pluralize(count, singular, plural) {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`
}

module.exports = { formatSize, pluralize }
