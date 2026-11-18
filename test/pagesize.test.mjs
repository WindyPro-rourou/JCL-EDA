import { test } from "node:test"
import assert from "node:assert/strict"
import { buildOverview, formatPageSize } from "../lib/board.js"

test("formatPageSize: 对象/字符串/空值 一律输出字符串", () => {
  assert.equal(formatPageSize({ w: 1170, h: 825, unit: "10mil" }), "1170×825 (10mil)")
  assert.equal(formatPageSize({ w: 100, h: 50 }), "100×50")
  assert.equal(formatPageSize("A4"), "A4")
  assert.equal(formatPageSize(null), "")
  assert.equal(formatPageSize({}), "")
})

test("buildOverview.pageSize 始终是字符串（防 output schema 违规回归）", () => {
  const raw = { domain: "sch", doc: "P1", pageSize: { w: 1170, h: 825, unit: "10mil" }, components: [], nets: [] }
  const o = buildOverview(raw)
  assert.equal(typeof o.pageSize, "string")
  assert.match(o.pageSize, /1170×825/)
  assert.equal(typeof buildOverview({}).pageSize, "string")
})