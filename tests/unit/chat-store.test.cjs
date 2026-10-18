const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.cwd() + '/node_modules/typescript');
function loadStore() {
 const storage = new Map(); let account = 'alice'; let writes = 0;
 const token = () => 'x.' + Buffer.from(JSON.stringify({ sub: account })).toString('base64') + '.x';
 const localStorage = { getItem: key => storage.get(key) || null, setItem: (key,value) => { writes++; storage.set(key,value); }, removeItem: key => storage.delete(key), get length(){return storage.size;}, key:i=>[...storage.keys()][i] };
 const context = { exports: {}, require: () => ({getAuthToken: token}), window: new EventTarget(), document: new EventTarget(), setTimeout, clearTimeout, localStorage, atob: v=>Buffer.from(v,'base64').toString() };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/lib/chat-store.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,context);
 return { store:context.exports, account: value=>account=value, storage, writes: () => writes };
}
test('device cache never crosses account boundaries',()=>{
 const {store,account}=loadStore();store.saveLocalCachedRooms([{id:'private'}]);store.saveLocalCachedMessages('private',[{id:'a'}]);
 store.flushChatCache();
 account('bob');assert.equal(store.getLocalCachedRooms().length,0);assert.equal(store.getLocalCachedMessages('private').length,0);
 account('alice');assert.equal(store.getLocalCachedRooms()[0].id,'private');assert.equal(store.getLocalCachedMessages('private')[0].id,'a');
});

test('a message burst updates memory immediately but writes each cache only once', () => {
 const {store,writes,storage}=loadStore();
 for(let i=0;i<100;i++) {
  store.saveLocalCachedRooms([{id:'r',unreadCount:i}]);
  store.saveLocalCachedMessages('r',[{id:String(i)}],String(i));
 }
 assert.equal(writes(),0);
 assert.equal(store.getLocalCachedMessages('r')[0].id,'99');
 store.flushChatCache();
 assert.equal(writes(),2);
 const snapshot=JSON.parse(storage.get('tfhc_cached_msgs_v3_alice_r'));
 assert.equal(snapshot.messages[0].id,'99'); assert.equal(snapshot.syncCursor,'99');
});

test('pending private writes are discarded on account change', () => {
 const {store,account,writes}=loadStore();store.saveLocalCachedMessages('r',[{id:'secret'}]);
 account('bob');store.flushChatCache();assert.equal(writes(),0);
 assert.equal(store.getLocalCachedMessages('r').length,0);
});

test('an empty hot room list does not resurrect an older persisted list', () => {
 const {store}=loadStore();store.saveLocalCachedRooms([{id:'old'}]);store.flushChatCache();
 store.saveLocalCachedRooms([]);assert.equal(store.getLocalCachedRooms().length,0);store.flushChatCache();
});
test('ack, socket duplicate and replay converge to one message',()=>{
 const {store}=loadStore();const pending={id:'client',clientId:'client',pending:true,createdAt:'2026-01-01'};
 const saved={id:'server',clientId:'client',createdAt:'2026-01-02'};
 let state=store.mergeChatMessages([pending],[saved]);state=store.mergeChatMessages(state,[saved]);state=store.mergeChatMessages(state,[pending]);
 assert.equal(state.length,1);assert.equal(state[0].id,'server');
});
test('out-of-order replay keeps timeline chronological',()=>{
 const {store}=loadStore();const messages=store.mergeChatMessages([{id:'b',createdAt:'2026-01-02'}],[{id:'a',createdAt:'2026-01-01'}]);
 assert.equal(messages.map(m=>m.id).join(','),'a,b');
});

test('stale network snapshots cannot undo an edit or tombstone',()=>{
 const {store}=loadStore();
 const newer={id:'a',body:null,createdAt:'2026-01-01',deletedAt:'2026-01-03'};
 const stale={id:'a',body:'old',createdAt:'2026-01-01',editedAt:'2026-01-02'};
 assert.equal(store.mergeChatMessages([newer],[stale])[0].body,null);
});
test('messages and sync cursor share the same cache snapshot',()=>{
 const {store}=loadStore();store.saveLocalCachedMessages('r',[{id:'a'}],'42');
 assert.equal(store.getLocalSyncCursor('r'),'42');
 store.saveLocalCachedMessages('r',[{id:'a'},{id:'b'}]);
 assert.equal(store.getLocalSyncCursor('r'),'42');
});
