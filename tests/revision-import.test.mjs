import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('revision import integration and failure-path suite', {timeout:180000}, () => {
  const result=spawnSync('python3',['tests/revision_import_test.py'],{
    cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:170000,
  });
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
