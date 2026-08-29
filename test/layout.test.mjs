/**
 * dsh-lichuang-eda · 框内定位（pickSpots）单元测试。
 * 硬规则：全部落在图框内边距内、100 网格、与已有图元间距 ≥150、互不冲突。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickSpots, insideFrame } from '../lib/layout.js'

const PAGE = { pageWidth: 1170, pageHeight: 825 }

test('pickSpots: 空页取 3 个空位 → 全在框内且互不冲突', () => {
  const spots = pickSpots({ ...PAGE, count: 3 })
  assert.equal(spots.length, 3)
  for (const s of spots) assert.ok(insideFrame({ ...s, ...PAGE }), `out of frame: ${JSON.stringify(s)}`)
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const dx = Math.abs(spots[i].x - spots[j].x)
      const dy = Math.abs(spots[i].y - spots[j].y)
      assert.ok(dx >= 150 || dy >= 150, `spots too close: ${JSON.stringify([spots[i], spots[j]])}`)
    }
  }
  // 右上优先（空页首点在最右）
  assert.equal(spots[0].x, 1170 - 80 - 100)
  assert.equal(spots[0].y, 80 + 100)
})

test('pickSpots: 避开已有图元（占用右侧第一个候选 → 顺延到左侧）', () => {
  const spots = pickSpots({ ...PAGE, used: [{ x: 990, y: 180 }], count: 1 })
  assert.equal(spots.length, 1)
  assert.notEqual(spots[0].x, 990, 'must skip the occupied grid point')
  assert.equal(spots[0].y, 180, 'stays on the same row')
})

test('pickSpots: 大量占用 → 返回已找数量并如实（不报错）', () => {
  const used = []
  for (let y = 180; y <= 800; y += 100) for (let x = 990; x >= 180; x -= 100) used.push({ x, y })
  const spots = pickSpots({ ...PAGE, used, count: 10 })
  assert.equal(spots.length, 0, 'page saturated → none left (real)')
})

test('pickSpots: 参数边界（count 上限/页面极小）', () => {
  const many = pickSpots({ ...PAGE, count: 200 })
  assert.ok(many.length <= 200 && many.length > 0)
  const tiny = pickSpots({ pageWidth: 300, pageHeight: 300, count: 3 })
  for (const s of tiny) assert.ok(insideFrame({ ...s, pageWidth: 300, pageHeight: 300 }), 'tiny page keeps frame margin')
})

test('insideFrame: 边距语义', () => {
  assert.equal(insideFrame({ x: 80, y: 80, ...PAGE }), true, 'margin edge is inside')
  assert.equal(insideFrame({ x: 70, y: 180, ...PAGE }), false, 'outside margin is out')
  assert.equal(insideFrame({ x: 990, y: 778, ...PAGE }), false, 'below bottom margin is out')
})
