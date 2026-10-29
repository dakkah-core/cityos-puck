import assert from 'node:assert/strict';
import test from 'node:test';
import { pinnedPnpmEnvironment } from './pinned-pnpm.mjs';

test('pinned pnpm commands fail instead of implicitly installing stale dependencies', () => {
  const environment = pinnedPnpmEnvironment(process.execPath, process.platform === 'win32' ? 'C:\\fixture\\pnpm.exe' : '/fixture/pnpm', {
    PATH: '', PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
  });
  assert.equal(environment.pnpm_config_verify_deps_before_run, 'error');
  assert.equal(Object.keys(environment).filter(key => key.toLowerCase() === 'pnpm_config_verify_deps_before_run').length, 1);
});
