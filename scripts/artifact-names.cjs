const templates = Object.freeze(require('../build/artifact-names.json'))

function artifactName(platform, version) {
  if (!Object.hasOwn(templates, platform)) throw new Error('Unknown package platform: ' + platform)
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Package version must contain three numeric components')
  return templates[platform].replace('${version}', version)
}

module.exports = { templates, artifactName }
