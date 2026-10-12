// Remove only the superseded Windows 1.9.12 package version after 1.9.13 is live.
const assert = require('node:assert/strict');

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
assert.equal(repository, 'fangzhouxiaohai/seal-office');
assert.ok(token, 'GitHub Actions package token is required');

const endpoint = 'https://api.github.com/users/fangzhouxiaohai/packages/container/seal-office-windows';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function request(path, options = {}) {
  const response = await fetch(endpoint + path, { headers, ...options });
  assert.ok(response.ok, `GitHub Packages ${options.method || 'GET'} ${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function main() {
  const pkg = await request('');
  assert.equal(pkg.repository?.full_name, repository, 'Package is not linked to this repository');
  const versions = await request('/versions?per_page=100');
  const tags = (version) => version.metadata?.container?.tags || [];
  const current = versions.find((version) => tags(version).includes('1.9.13'));
  assert.ok(current && tags(current).includes('latest'), 'Current Windows package is not the latest verified version');
  const previous = versions.filter((version) => tags(version).includes('1.9.12'));
  for (const version of previous) {
    assert.notEqual(version.id, current.id);
    assert.ok(!tags(version).includes('latest'), 'Refusing to delete the current latest version');
    await request(`/versions/${version.id}`, { method: 'DELETE' });
    console.log(`Removed superseded Windows package version ${version.id}`);
  }
  const remaining = await request('/versions?per_page=100');
  assert.ok(remaining.some((version) => tags(version).includes('1.9.13') && tags(version).includes('latest')));
  assert.ok(!remaining.some((version) => tags(version).includes('1.9.12')));
  console.log('Windows package now exposes only the 1.9.13 release tag and latest among the two releases');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
