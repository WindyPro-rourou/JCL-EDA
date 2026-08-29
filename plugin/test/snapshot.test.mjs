/**
 * dsh-lichuang-eda · 紧急保存（snapshot）单元测试。
 *
 * createSnapshot 的核心契约：每步独立降级（best-effort）——
 *   - 已连接：工程信息/文档信息/文档文件(.epro2)/预览 SVG/网表/BOM + 日志 + meta + README；
 *   - 未连接：仅 日志 + meta + README（如实降级，不抛错）；
 *   - 单步失败：errors[] 记录，其余文件照常保存。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSnapshot, parseMaybeJson, sanitizeName } from '../lib/snapshot.js'

const PROJECT_INFO = { name: 'esp32_multitool', uuid: 'proj-1' }
const DOC_INFO = { documentType: 1, documentName: 'Schematic1/P1', documentId: 'doc-1' }

function fakeExecute(overrides = {}) {
  return async (code) => {
    if (code.includes('dmt_Project.getCurrentProjectInfo')) return { ok: true, result: JSON.stringify(overrides.project ?? PROJECT_INFO) }
    if (code.includes('dmt_SelectControl.getCurrentDocumentInfo')) return { ok: true, result: JSON.stringify(overrides.doc ?? DOC_INFO) }
    if (code.includes('sys_FileManager.getDocumentFile')) {
      if (overrides.docFileError) return { ok: false, error: overrides.docFileError }
      return { ok: true, result: JSON.stringify({ name: 'esp32_multitool.epro2', size: 99, type: 'application/octet-stream', len: 25, text: '{"head":{"docType":5}}' }) }
    }
    if (code.includes('getExportDocumentFile')) {
      if (overrides.svgError) return { ok: false, error: overrides.svgError }
      return { ok: true, result: JSON.stringify({ name: 'esp32_multitool-preview.svg', size: 20, len: 20, text: '<svg xmlns=""/>' }) }
    }
    if (code.includes('getNetlistFile')) return { ok: true, result: JSON.stringify({ nets: [{ name: 'GND' }] }) }
    if (code.includes('getBomFile')) return { ok: true, result: JSON.stringify({ bom: [{ ref: 'R1' }] }) }
    return { ok: true, result: 'unknown-code:' + code.slice(0, 40) }
  }
}

test('snapshot 已连接：完整现场（epro2+SVG+网表+BOM+日志+meta+README）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eda-snap-'))
  const out = await createSnapshot({
    execute: fakeExecute(),
    activities: () => [{ tool: 'eda_exec', action: '放置元件' }, { tool: 'eda_sch_drc', action: '原理图 DRC' }],
    connected: true,
    dir,
    now: () => new Date('2026-08-29T12:34:56Z'),
  })
  assert.equal(out.ok, true)
  assert.deepEqual(out.errors, [])
  assert.equal(out.docFile, 'esp32_multitool.epro2')
  assert.equal(out.preview, 'esp32_multitool-preview.svg')
  const names = (await readdir(out.dir)).sort()
  for (const expected of ['esp32_multitool.epro2', 'esp32_multitool-preview.svg', 'netlist.json', 'bom.json', 'log.json', 'meta.json', 'README.txt']) {
    assert.ok(names.includes(expected), `missing ${expected} in ${names.join(', ')}`)
  }
  const meta = JSON.parse(await readFile(join(out.dir, 'meta.json'), 'utf8'))
  assert.equal(meta.project.name, 'esp32_multitool')
  assert.equal(meta.document.documentType, 1)
  assert.equal(meta.files.length, out.files.length)
  const readme = await readFile(join(out.dir, 'README.txt'), 'utf8')
  assert.match(readme, /专业版/)
  assert.match(readme, /标准版/)
  assert.match(readme, /esp32_multitool\.epro2/)
  const log = JSON.parse(await readFile(join(out.dir, 'log.json'), 'utf8'))
  assert.equal(log.entries.length, 2)
})

test('snapshot 未连接：仅日志留档（如实降级，不抛错）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eda-snap-'))
  const out = await createSnapshot({
    execute: fakeExecute(),
    activities: () => [{ tool: 'eda_exec', action: '放置元件' }],
    connected: false,
    dir,
    now: () => new Date('2026-08-29T12:34:56Z'),
  })
  assert.equal(out.ok, true)
  assert.equal(out.connected, false)
  assert.ok(out.errors.length >= 1, 'degraded note recorded')
  assert.ok(out.errors.some((e) => e.includes('未连接')), 'the note explains the disconnect')
  const names = (await readdir(out.dir)).sort()
  assert.deepEqual(names, ['README.txt', 'log.json', 'meta.json'])
  const meta = JSON.parse(await readFile(join(out.dir, 'meta.json'), 'utf8'))
  assert.equal(meta.connected, false)
  assert.equal(meta.project, null)
})

test('snapshot 单步失败（文档文件权限/异常）：errors 记录，其余照常', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eda-snap-'))
  const out = await createSnapshot({
    execute: fakeExecute({ docFileError: '权限不足：Engineering Design > File Export' }),
    activities: () => [],
    connected: true,
    dir,
    now: () => new Date('2026-08-29T12:34:56Z'),
  })
  assert.equal(out.ok, true)
  const names = (await readdir(out.dir)).sort()
  assert.ok(!names.includes('esp32_multitool.epro2'), 'failed step leaves no file')
  assert.ok(names.includes('esp32_multitool-preview.svg'), 'other steps continue')
  assert.ok(names.includes('README.txt'))
  assert.ok(out.errors.length >= 1)
  const readme = await readFile(join(out.dir, 'README.txt'), 'utf8')
  assert.match(readme, /降级项/)
})

test('snapshot execute 抛异常：同样降级不炸', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eda-snap-'))
  const out = await createSnapshot({
    execute: async () => { throw new Error('bridge exploded') },
    activities: () => [],
    connected: true,
    dir,
    now: () => new Date('2026-08-29T12:34:56Z'),
  })
  assert.equal(out.ok, true)
  assert.ok(out.errors.length >= 3, 'each bridge step records a failure')
  assert.ok(out.errors.some((e) => e.includes('bridge exploded')))
})

test('parseMaybeJson / sanitizeName: 易错输入', () => {
  assert.deepEqual(parseMaybeJson('{"a":1}'), { a: 1 })
  assert.equal(parseMaybeJson('not json'), 'not json')
  assert.equal(sanitizeName('esp32_multitool'), 'esp32_multitool')
  assert.equal(sanitizeName('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j')
  assert.equal(sanitizeName(''), 'eda-snapshot')
})
