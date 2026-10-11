const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateRelease, verifyFiles, checksum } = require('./publish-packages.cjs');
const release = require('./package-release.json');

test('all three platforms reference pinned, safe Release installer assets', () => {
  validateRelease(release);
  for (const name of ['../installer.apk', 'unsafe:file.apk']) {
    const malformed = structuredClone(release);
    malformed.platforms.android.assets[0].name = name;
    assert.throws(() => validateRelease(malformed));
  }
});

test('reject altered installer bytes even when the file size remains identical', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-package-test-'));
  try {
    const file = path.join(directory, 'installer.apk');
    await fs.writeFile(file, 'original');
    const assets = [{ name: 'installer.apk', size: 8, sha256: await checksum(file) }];
    await verifyFiles(directory, assets);
    await fs.writeFile(file, 'modified');
    await assert.rejects(verifyFiles(directory, assets), /SHA-256/);
    await fs.writeFile(file, 'truncated');
    await assert.rejects(verifyFiles(directory, assets), /size/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
