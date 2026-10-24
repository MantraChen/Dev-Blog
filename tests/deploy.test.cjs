const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('Windows deployment preserves service on build failure and rolls back migration/health failures', { skip: process.platform !== 'win32' }, () => {
  for (const scenario of ['success', 'build-fail', 'migration-fail', 'start-fail', 'health-fail']) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'tests/deploy-harness.ps1', '-Scenario', scenario], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp('PASS ' + scenario));
  }
});
