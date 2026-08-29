/**
 * dsh-lichuang-eda · 记录式时间线（ActivityLog）+ 撤回 diff 单元测试。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ActivityLog } from '../lib/activity.js'
import { diffIds } from '../lib/index.js'

async function tmpLog() {
  const dir = await mkdtemp(join(tmpdir(), 'eda-act-'))
  return new ActivityLog({ file: join(dir, 'activity.jsonl'), cap: 200 })
}

test('ActivityLog: push/update/feed 基本语义（含 pending→done 与会话 sid）', async () => {
  const log = await tmpLog()
  const id = log.push({ tool: 'eda_exec', action: '放置元件', code: 'x', sid: 'sess-a', status: 'pending' })
  assert.equal(id, 1)
  log.update(id, { status: 'done', ok: true, result: 'LED1', durationMs: 123 })
  const feed = log.feed()
  assert.equal(feed.activities.length, 1)
  const a = feed.activities[0]
  assert.equal(a.id, 1)
  assert.equal(a.status, 'done')
  assert.equal(a.ok, true)
  assert.equal(a.durationMs, 123)
  assert.equal(feed.currentSid, 'sess-a')
  assert.equal(feed.sessions.length, 1)
  assert.equal(feed.sessions[0].sid, 'sess-a')
})

test('ActivityLog: 持久化落盘 + loadSync 恢复（重启不空）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eda-act-'))
  const file = join(dir, 'activity.jsonl')
  const log1 = new ActivityLog({ file }).loadSync()
  log1.push({ tool: 'eda_exec', action: '画导线', ok: true, result: 'ok' })
  log1.push({ tool: 'eda_snapshot', action: '紧急保存', ok: true, result: 'dir' })
  await log1._persist() // flush
  const text = await readFile(file, 'utf8')
  assert.match(text, /画导线/)
  assert.match(text, /紧急保存/)
  const log2 = new ActivityLog({ file }).loadSync()
  const feed = log2.feed()
  assert.equal(feed.activities.length, 2, 'history restored from disk')
  assert.equal(feed.activities[0].action, '紧急保存', 'newest first')
})

test('ActivityLog: clear 清空内存与磁盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eda-act-'))
  const file = join(dir, 'activity.jsonl')
  const log = new ActivityLog({ file }).loadSync()
  log.push({ tool: 'eda_exec', action: 'x', ok: true })
  await log.clear()
  assert.equal(log.feed().activities.length, 0)
  assert.equal(await readFile(file, 'utf8'), '')
})

test('ActivityLog: cap 截断（保留最新）', async () => {
  const log = new ActivityLog({ cap: 5 })
  for (let i = 0; i < 9; i++) log.push({ tool: 't', action: 'n' + i, ok: true })
  const feed = log.feed()
  assert.equal(feed.activities.length, 5)
  assert.equal(feed.activities[0].action, 'n8', 'newest kept first')
})

test('diffIds: 创建/删除图元清单（撤回数据源）', () => {
  const before = { domain: 'sch', component: ['a', 'b'], wire: ['w1'], via: [], line: [] }
  const after = { domain: 'sch', component: ['a', 'b', 'c'], wire: ['w1', 'w2'], via: [], line: [] }
  const diff = diffIds(before, after)
  assert.equal(diff.created.length, 2)
  assert.ok(diff.created.some((c) => c.type === 'component' && c.id === 'c'))
  assert.ok(diff.created.some((c) => c.type === 'wire' && c.id === 'w2'))
  assert.equal(diff.deletedCount, 0)
  const diff2 = diffIds({ ...before, component: ['a', 'b', 'd'] }, after)
  assert.equal(diff2.deletedCount, 1, 'deleted d counted (unrecoverable)')
  assert.equal(diffIds(null, after), null, 'missing snapshots → no revoke data')
  assert.equal(diffIds(before, null), null)
})
