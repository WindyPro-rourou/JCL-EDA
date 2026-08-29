/**
 * dsh-lichuang-eda · installer pure-function tests (no network).
 * The real download/install path (GitHub archive + tar + npm install) is
 * intentionally manual — it hits the network and takes ~10-30s.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OFFICIAL_REPO, OFFICIAL_EXT_URL, bridgeDir, bridgeScriptPath, isBridgeInstalled, sha256Hex } from '../lib/installer.js'

test('official installer constants point at the official repo/marketplace', () => {
  assert.equal(OFFICIAL_REPO, 'easyeda/easyeda-api-skill')
  assert.match(OFFICIAL_EXT_URL, /jlc-ext\.com\/item\/oshwhub\/run-api-gateway/)
})

test('bridge paths live under ~/.dsh/eda/bridge', () => {
  assert.match(bridgeDir(), /[\\/]\.dsh[\\/]eda[\\/]bridge$/)
  assert.ok(bridgeScriptPath().endsWith('scripts' + (process.platform === 'win32' ? '\\' : '/') + 'bridge-server.mjs'))
})

test('isBridgeInstalled() returns a boolean (machine-dependent state)', () => {
  assert.equal(typeof isBridgeInstalled(), 'boolean')
})

test('sha256Hex: 确定性哈希', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
