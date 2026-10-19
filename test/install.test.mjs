/**
 * dsh-lichuang-eda · installer pure-function tests (no network).
 * The real download/install path (GitHub archive + tar + npm install) is
 * intentionally manual — it hits the network and takes ~10-30s.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OFFICIAL_REPO, OFFICIAL_EXT_URL, bridgeDir, bridgeDirs, bridgeScriptPath, dshHomeCandidates, isBridgeInstalled, sha256Hex } from '../lib/installer.js'

test('official installer constants point at the official repo/marketplace', () => {
  assert.equal(OFFICIAL_REPO, 'easyeda/easyeda-api-skill')
  assert.match(OFFICIAL_EXT_URL, /jlc-ext\.com\/item\/oshwhub\/run-api-gateway/)
})

test('bridge paths resolve under a DSH home (classic ~/.dsh or portable data/dsh-home)', () => {
  const dir = bridgeDir()
  // 经典 ~/.dsh/eda/bridge 或便携版 <root>/data/dsh-home/eda/bridge
  assert.match(dir, /[\\/]eda[\\/]bridge$/)
  assert.ok(
    /[\\/]\.dsh[\\/]eda[\\/]bridge$/.test(dir) || /[\\/]dsh-home[\\/]eda[\\/]bridge$/.test(dir),
    `bridgeDir() 应位于 DSH home 下（经典或便携），实际: ${dir}`,
  )
  assert.ok(bridgeScriptPath().endsWith('scripts' + (process.platform === 'win32' ? '\\' : '/') + 'bridge-server.mjs'))
})

test('portable-aware probing: candidates include classic ~/.dsh and are deduped', () => {
  const homes = dshHomeCandidates()
  assert.ok(homes.length >= 1, '至少有经典 ~/.dsh 候选')
  assert.ok(homes.some((h) => h.endsWith('.dsh') || h.endsWith('dsh-home')), `候选里应含 DSH home，实际: ${homes.join(', ')}`)
  assert.equal(new Set(homes).size, homes.length, '候选应去重')
  assert.equal(bridgeDirs().length, homes.length, '每个 home 对应一个 bridge 候选')
})

test('isBridgeInstalled() returns a boolean (machine-dependent state)', () => {
  assert.equal(typeof isBridgeInstalled(), 'boolean')
})

test('sha256Hex: 确定性哈希', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
