// Rebuild the gallery from the user-approved SVG masters. Product icons are
// imported with build/import-ui-icons.cjs; never regenerate masters from them.
const fs = require('fs')
const path = require('path')
const assets = path.join(__dirname, 'assets')
const names = fs.readdirSync(path.join(assets, 'pc')).filter(name => name.endsWith('.svg')).map(name => name.slice(0, -4)).sort()
const records = names.map(name => ({ name, ...Object.fromEntries(['pc', 'mobile'].map(platform => [platform, fs.readFileSync(path.join(assets, platform, name + '.svg'), 'utf8')])) }))
fs.writeFileSync(path.join(assets, 'icons.js'), 'window.SEAL_ICON_PROPOSAL = ' + JSON.stringify(records) + ';\n')
console.log(JSON.stringify({ iconsPerPlatform: records.length, approvedMastersPreserved: true }))
