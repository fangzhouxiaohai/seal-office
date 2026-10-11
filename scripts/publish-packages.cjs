// GitHub Packages archives the exact, already verified Release installers as OCI artifacts.
// Node 22+ and ORAS 1.3.0; no application rebuild or credential stored in the repository.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const release = require('./package-release.json');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const checksum = async (file) => {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
const mediaType = (name) => ({ '.exe': 'application/vnd.microsoft.portable-executable',
  '.msix': 'application/msix', '.apk': 'application/vnd.android.package-archive',
  '.deb': 'application/vnd.debian.binary-package', '.zip': 'application/zip',
  '.md': 'text/markdown', '.txt': 'text/plain', '.json': 'application/json' }[path.extname(name)]);

function validateRelease(config) {
  assert.match(config.repository, /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
  assert.match(config.version, /^\d+\.\d+\.\d+$/);
  assert.equal(config.tag, `v${config.version}`);
  assert.ok(Number.isFinite(Date.parse(config.created)));
  assert.deepEqual(Object.keys(config.platforms).sort(), ['android', 'linux', 'windows']);
  for (const platform of Object.values(config.platforms)) {
    if (platform.packageTag !== undefined) {
      assert.match(platform.packageTag, /^\d+\.\d+\.\d+-r[1-9]\d*$/);
      assert.ok(platform.packageTag.startsWith(config.version + '-r'));
    }
    assert.ok(platform.assets.length > 0);
    assert.equal(new Set(platform.assets.map((a) => a.name)).size, platform.assets.length);
    for (const asset of platform.assets) {
      assert.match(asset.name, /^[a-zA-Z0-9_.-]+$/);
      assert.ok(mediaType(asset.name));
      assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    }
  }
}

async function verifyFiles(directory, assets) {
  for (const asset of assets) {
    assert.equal((await fsp.stat(path.join(directory, asset.name))).size, asset.size, `${asset.name}: size`);
    assert.equal(await checksum(path.join(directory, asset.name)), asset.sha256, `${asset.name}: SHA-256`);
  }
}

async function api(endpoint) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }
  });
  assert.ok(response.ok, `GitHub API ${endpoint}: HTTP ${response.status}`);
  return response.json();
}

function context(platform, directory) {
  validateRelease(release);
  assert.ok(Object.hasOwn(release.platforms, platform), 'Unknown platform');
  const owner = release.repository.split('/')[0].toLowerCase();
  const name = `seal-office-${platform}`;
  const spec = release.platforms[platform];
  const packageTag = spec.packageTag || release.version;
  return { platform, directory: path.resolve(directory), owner, name,
    packageTag, ref: `ghcr.io/${owner}/${name}:${packageTag}`,
    page: `https://github.com/users/${owner}/packages/container/package/${name}`,
    url: `https://github.com/${release.repository}/releases/tag/${release.tag}`,
    spec };
}

async function prepare(ctx, sourceDirectory) {
  await fsp.mkdir(ctx.directory, { recursive: true });
  const upstream = sourceDirectory ? null : await api(`/repos/${release.repository}/releases/tags/${release.tag}`);
  if (upstream) assert.equal(upstream.draft, false);
  for (const asset of ctx.spec.assets) {
    const destination = path.join(ctx.directory, asset.name);
    if (sourceDirectory) {
      await fsp.copyFile(path.join(sourceDirectory, asset.name), destination);
    } else {
      const remote = upstream.assets.find((row) => row.name === asset.name);
      assert.ok(remote, `Missing Release asset: ${asset.name}`);
      assert.equal(remote.state, 'uploaded');
      assert.equal(remote.size, asset.size);
      assert.equal(remote.digest, `sha256:${asset.sha256}`);
      const expectedUrl = `https://github.com/${release.repository}/releases/download/${release.tag}/${asset.name}`;
      assert.equal(remote.browser_download_url, expectedUrl);
      // Public download: API authorization is never sent to the asset storage host.
      const response = await fetch(expectedUrl);
      assert.ok(response.ok, `Download ${asset.name}: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
    }
  }
  await verifyFiles(ctx.directory, ctx.spec.assets);
  const annotations = {
    'org.opencontainers.image.title': `海豹办公 ${ctx.platform} 安装文件`,
    'org.opencontainers.image.description': ctx.spec.description,
    'org.opencontainers.image.source': `https://github.com/${release.repository}`,
    'org.opencontainers.image.url': ctx.url,
    'org.opencontainers.image.version': ctx.packageTag,
    'org.opencontainers.image.created': release.created,
    'org.opencontainers.image.licenses': 'MIT'
  };
  await fsp.writeFile(path.join(ctx.directory, 'installer-config.json'), json({
    artifact: 'seal-office-installers', version: release.version, packageTag: ctx.packageTag, platform: ctx.platform,
    config: { Labels: annotations }, assets: ctx.spec.assets
  }));
  await fsp.writeFile(path.join(ctx.directory, 'annotations.json'), json({ '$manifest': annotations }));
  await fsp.writeFile(path.join(ctx.directory, 'installer-metadata.json'), json({
    schemaVersion: 1, ...release, platforms: undefined, platform: ctx.platform, packageTag: ctx.packageTag, assets: ctx.spec.assets
  }));
  await fsp.writeFile(path.join(ctx.directory, 'README.md'),
    `# 海豹办公 ${ctx.packageTag} · ${ctx.platform}\n\n${ctx.spec.description}\n\n` +
    `直接下载安装：[GitHub Release](${ctx.url}) · [GitCode Release](https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/${release.tag})\n\n` +
    `提取本包：\n\n\`\`\`sh\noras pull ${ctx.ref}\n\`\`\`\n\n` +
    `安装方法：${ctx.spec.usage}\n\n文件内容与 Release 完全一致；SHA256SUMS.txt 提供校验值。\n`);
  const payload = [...ctx.spec.assets, ...await Promise.all(['README.md', 'installer-metadata.json'].map(async (name) => ({
    name, size: (await fsp.stat(path.join(ctx.directory, name))).size, sha256: await checksum(path.join(ctx.directory, name))
  })))];
  await fsp.writeFile(path.join(ctx.directory, 'SHA256SUMS.txt'), payload.map((a) => `${a.sha256}  ${a.name}\n`).join(''));
  payload.push({ name: 'SHA256SUMS.txt', size: (await fsp.stat(path.join(ctx.directory, 'SHA256SUMS.txt'))).size,
    sha256: await checksum(path.join(ctx.directory, 'SHA256SUMS.txt')) });
  await fsp.writeFile(path.join(ctx.directory, 'payload.json'), json(payload));
  console.log(`Prepared ${ctx.platform}: ${ctx.spec.assets.length} verified Release files`);
}

function oras(ctx, args, allowFailure = false) {
  const result = spawnSync(process.env.ORAS_BIN || 'oras', args, {
    cwd: ctx.directory, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    ...(process.env.ORAS_REGISTRY_CONFIG ? { env: { ...process.env,
      ORAS_REGISTRY_CONFIG: process.env.ORAS_REGISTRY_CONFIG } } : {})
  });
  if (result.error) throw result.error;
  if (!allowFailure) assert.equal(result.status, 0, `ORAS ${args[0]} failed: ${result.stderr}`);
  return result;
}

async function publish(ctx, localOnly) {
  const payload = JSON.parse(await fsp.readFile(path.join(ctx.directory, 'payload.json'), 'utf8'));
  await verifyFiles(ctx.directory, payload);
  const layout = path.join(ctx.directory, 'oci');
  const localRef = `${layout}:${ctx.packageTag}`;
  // OCI 1.0 with a custom config is supported by GHCR; layers contain the original file bytes.
  oras(ctx, ['push', '--oci-layout', '--image-spec', 'v1.0', '--config',
    'installer-config.json:application/vnd.seal-office.installer.config.v1+json',
    '--annotation-file', 'annotations.json', '--export-manifest', 'manifest.json', localRef,
    ...payload.map((a) => `${a.name}:${mediaType(a.name)}`)]);
  const digest = `sha256:${await checksum(path.join(ctx.directory, 'manifest.json'))}`;
  const pullDirectory = path.join(ctx.directory, localOnly ? 'local-pull' : 'remote-pull');
  if (localOnly) {
    oras(ctx, ['pull', '--oci-layout', localRef, '-o', pullDirectory]);
    await verifyFiles(pullDirectory, payload);
    console.log(`Local OCI push/pull verified: ${ctx.platform} ${digest}`);
    return;
  }
  assert.equal(process.env.GITHUB_REPOSITORY, release.repository, 'Publishing must run in the linked repository');
  const registryArgs = process.env.ORAS_REGISTRY_CONFIG ? ['--registry-config', process.env.ORAS_REGISTRY_CONFIG] : [];
  const existing = oras(ctx, ['resolve', ...registryArgs, ctx.ref], true);
  if (existing.status === 0) {
    assert.equal(existing.stdout.trim(), digest, 'Existing version differs; refusing to replace a published version');
  } else {
    const copyRegistryArgs = process.env.ORAS_REGISTRY_CONFIG ? ['--to-registry-config', process.env.ORAS_REGISTRY_CONFIG] : [];
    oras(ctx, ['cp', ...copyRegistryArgs, '--from-oci-layout', localRef, ctx.ref]);
  }
  assert.equal(oras(ctx, ['resolve', ...registryArgs, ctx.ref]).stdout.trim(), digest);
  oras(ctx, ['pull', ...registryArgs, `${ctx.ref.split(':')[0]}@${digest}`, '-o', pullDirectory]);
  await verifyFiles(pullDirectory, payload);
  // Only advance latest after downloading the published artifact and checking every byte.
  oras(ctx, ['tag', ...registryArgs, `${ctx.ref.split(':')[0]}@${digest}`, 'latest']);
  assert.equal(oras(ctx, ['resolve', ...registryArgs, `${ctx.ref.split(':')[0]}:latest`]).stdout.trim(), digest);
  const pkg = await api(`/users/${ctx.owner}/packages/container/${ctx.name}`);
  assert.equal(pkg.repository?.full_name, release.repository, 'Package is not linked to the repository');
  const versions = await api(`/users/${ctx.owner}/packages/container/${ctx.name}/versions?per_page=100`);
  const current = versions.find((v) => v.name === digest);
  assert.ok(current?.metadata?.container?.tags?.includes(ctx.packageTag));
  assert.ok(current.metadata.container.tags.includes('latest'));
  const result = { platform: ctx.platform, version: release.version, packageTag: ctx.packageTag, reference: ctx.ref,
    digest, packageUrl: pkg.html_url || ctx.page, repository: pkg.repository.full_name,
    visibility: pkg.visibility, tags: current.metadata.container.tags,
    verified: true, assets: ctx.spec.assets, payload, workflowCommit: process.env.GITHUB_SHA,
    workflowUrl: `https://github.com/${release.repository}/actions/runs/${process.env.GITHUB_RUN_ID}` };
  await fsp.writeFile(path.join(ctx.directory, 'published-package.json'), json(result));
  if (process.env.GITHUB_STEP_SUMMARY) await fsp.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### ${ctx.platform} ${ctx.packageTag}\n\n[Package](${result.packageUrl}) · ${result.visibility}\n\n` +
    `Published and downloaded ${ctx.spec.assets.length} original Release files; all SHA-256 checks passed.\n\n\`${digest}\`\n`);
  console.log(json(result));
}

async function main() {
  const [mode, platform, directory, sourceDirectory] = process.argv.slice(2);
  assert.ok(directory, 'Usage: publish-packages.cjs prepare|local-check|publish platform output-directory [local-release-directory]');
  const ctx = context(platform, directory);
  if (mode === 'prepare') await prepare(ctx, sourceDirectory && path.resolve(sourceDirectory));
  else if (mode === 'local-check' || mode === 'publish') await publish(ctx, mode === 'local-check');
  else throw new Error('Unknown command');
}
module.exports = { validateRelease, verifyFiles, checksum };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
