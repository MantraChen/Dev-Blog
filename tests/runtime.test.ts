import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedRuntime } from '../scripts/check-runtime.mjs';
test('runtime checks reject unpatched and unsupported Node branches',()=>{
  for(const version of ['20.20.0','22.23.3','24.19.0','24.22.0','25.9.0','26.12.0']) assert.equal(supportedRuntime(version),false,version);
  for(const version of ['22.23.4','24.22.1','24.23.0','26.12.1']) assert.equal(supportedRuntime(version),true,version);
});
