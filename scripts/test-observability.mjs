import assert from 'node:assert/strict';

const baseUrl = process.env.PPIC_BASE_URL || 'http://127.0.0.1:3000';

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.ok(response.ok, `${path}: http ${response.status}`);
  return response.json();
}

const settingsPayload = await fetchJson('/api/settings');

assert.equal(settingsPayload.ok, true, '/api/settings: ok flag');
assert.ok(Array.isArray(settingsPayload.syncHistory), '/api/settings: syncHistory array');
assert.ok(Array.isArray(settingsPayload.importHistory), '/api/settings: importHistory array');

if (settingsPayload.syncHistory.length) {
  const firstSync = settingsPayload.syncHistory[0];
  assert.ok(Object.prototype.hasOwnProperty.call(firstSync, 'status'), '/api/settings: sync status field');
  assert.ok(Object.prototype.hasOwnProperty.call(firstSync, 'message'), '/api/settings: sync message field');
}

if (settingsPayload.importHistory.length) {
  const firstImport = settingsPayload.importHistory[0];
  assert.ok(Object.prototype.hasOwnProperty.call(firstImport, 'mode'), '/api/settings: import mode field');
  assert.ok(Object.prototype.hasOwnProperty.call(firstImport, 'saved_rows'), '/api/settings: import saved_rows field');
  assert.ok(Object.prototype.hasOwnProperty.call(firstImport, 'message'), '/api/settings: import message field');
}

console.log(JSON.stringify({
  ok: true,
  syncHistoryCount: settingsPayload.syncHistory.length,
  importHistoryCount: settingsPayload.importHistory.length,
}, null, 2));
