/**
 * dsh-lichuang-eda unit tests (node:test).
 *
 * Covers the eda_skill_read doc-access module (lib/skill.js): safe doc path
 * resolution (resolveDoc), reading a long doc with offset pagination
 * (readSkillDoc), and the vendored-skill doc index (listSkillDocs).
 *
 * Doc paths are resolved relative to <repo>/skill, and every test uses a bare
 * relative path (e.g. 'references/classes/SCH_PrimitiveComponent.md'), so the
 * suite never depends on a drive letter or an external absolute path.
 *
 * Run: node --test test/skill.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDoc, readSkillDoc, listSkillDocs } from '../lib/skill.js'

test('resolveDoc() resolves the vendored entry docs (SKILL.md, INDEX.md)', () => {
  assert.ok(resolveDoc('SKILL.md') !== null)
  // INDEX.md is produced by the gen-index step; keep the message readable if it
  // has not been generated yet, so the failure points clearly at that step.
  const idx = resolveDoc('INDEX.md')
  assert.ok(idx !== null, 'INDEX.md 应由 gen-index 步骤生成')
})

test('resolveDoc() resolves a vendored class doc (hard assertion)', () => {
  const p = resolveDoc('references/classes/SCH_PrimitiveComponent.md')
  assert.ok(p !== null, '参考资料 references/classes/SCH_PrimitiveComponent.md 应可解析')
  assert.ok(p.replaceAll('\\', '/').endsWith('references/classes/SCH_PrimitiveComponent.md'))
})

test('resolveDoc() rejects path traversal and empty input', () => {
  assert.equal(resolveDoc('../package.json'), null)
  assert.equal(resolveDoc('..\\..\\package.json'), null)
  assert.equal(resolveDoc(''), null)
})

test('readSkillDoc() reads a long class doc with offset pagination', async () => {
  const first = await readSkillDoc('references/classes/SCH_PrimitiveComponent.md')
  assert.equal(first.ok, true)
  assert.ok(first.content.includes('create'), '首个分片应包含 create')
  assert.ok(first.content.includes('createNetFlag'), '首个分片应包含 createNetFlag')
  assert.ok(first.len > 1000, `文档长度应大于 1000，实际 ${first.len}`)
  assert.equal(first.truncated, true, '长文档应标记为 truncated')
  assert.equal(typeof first.nextOffset, 'number')
  assert.ok(first.nextOffset > 0)

  // 从上一页返回的 nextOffset 继续读：start 应等于 nextOffset，且内容非空。
  const second = await readSkillDoc('references/classes/SCH_PrimitiveComponent.md', {
    offset: first.nextOffset,
  })
  assert.equal(second.ok, true)
  assert.equal(second.start, first.nextOffset)
  assert.ok(second.content.length > 0)
})

test('readSkillDoc() rejects an unknown doc with a friendly error', async () => {
  const res = await readSkillDoc('nope.md')
  assert.equal(res.ok, false)
  assert.match(res.error, /未知文档/)
})

test('listSkillDocs() returns the vendored skill doc index', () => {
  const idx = listSkillDocs()
  assert.ok(Array.isArray(idx.files))
  assert.ok(idx.count >= 100, `doc 数应 >= 100，实际 ${idx.count}`)
  assert.ok(idx.files.includes('references/classes/SCH_PrimitiveComponent.md'))
  assert.ok(idx.files.includes('SKILL.md'))
})
