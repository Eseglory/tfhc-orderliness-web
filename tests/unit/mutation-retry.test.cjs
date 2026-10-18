const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function harness(storage = new Map()) {
  const context = { exports: {}, window: {}, crypto: webcrypto, TextEncoder, Uint8Array, FormData,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/lib/mutation-retry.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { retry: context.exports.mutationRetry, storage };
}
test('uncertain writes reuse keys across retries and reloads without storing private payloads', async () => {
  const h = harness();
  const first = await h.retry('member', '/payments', 'POST', 'private body');
  assert.equal((await h.retry('member', '/payments', 'POST', 'private body')).key, first.key);
  assert.equal((await harness(h.storage).retry('member', '/payments', 'POST', 'private body')).key, first.key);
  assert.ok(!JSON.stringify([...h.storage]).includes('private body'));
  first.complete();
  assert.notEqual((await h.retry('member', '/payments', 'POST', 'private body')).key, first.key);
});
test('different actors and payloads cannot share a cached mutation response', async () => {
  const { retry } = harness();
  const a = await retry('alice', '/payments', 'POST', 'one');
  assert.notEqual((await retry('bob', '/payments', 'POST', 'one')).key, a.key);
  assert.notEqual((await retry('alice', '/payments', 'POST', 'two')).key, a.key);
  assert.equal(await retry('alice', '/payments', 'GET'), undefined);
  assert.equal(await retry('alice', '/auth/login', 'POST', 'credentials'), undefined);
});
test('multipart retries distinguish file contents and reuse identical submissions', async () => {
  const { retry } = harness();
  const body = new FormData(); body.append('receipt', new Blob(['first']), 'receipt.txt');
  const first = await retry('alice', '/payments', 'POST', body);
  assert.equal((await retry('alice', '/payments', 'POST', body)).key, first.key);
  const changed = new FormData(); changed.append('receipt', new Blob(['second']), 'receipt.txt');
  assert.notEqual((await retry('alice', '/payments', 'POST', changed)).key, first.key);
});
