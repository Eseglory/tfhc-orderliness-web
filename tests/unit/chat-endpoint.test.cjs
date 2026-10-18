const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, URL };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/lib/chat-endpoint.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
for (const [base, namespace, path] of [
  ['https://tfhc-orderliness-api.onrender.com', 'https://tfhc-orderliness-api.onrender.com/chat', '/socket.io'],
  ['http://localhost:4000/', 'http://localhost:4000/chat', '/socket.io'],
  ['https://staging.utilityhub.ng/tfhc', 'https://staging.utilityhub.ng/chat', '/tfhc/socket.io'],
  ['https://staging.utilityhub.ng/tfhc/', 'https://staging.utilityhub.ng/chat', '/tfhc/socket.io'],
]) {
  test(`chat namespace and transport route for ${base}`, () => {
    const actual = context.exports.chatEndpoint(base);
    assert.equal(actual.namespace, namespace);
    assert.equal(actual.path, path);
  });
}
