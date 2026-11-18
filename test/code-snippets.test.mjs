/**
 * dsh-lichuang-eda · 代码片段编译护栏。
 *
 * 插件会把内部拼好的 JS 片段发到编辑器里执行（bridge / CLI / MCP 三条通路都一样）。
 * 这类片段一旦有语法/重复声明问题，工具会在运行时才报错（真实案例：
 * OVERVIEW_CODE 的 PCB 分支 `map(x => { let x = 0 … })` 造成
 * "Identifier 'x' has already been declared"，且顺带让 y 坐标永远读不到）。
 * 这里把所有内联片段离线编译一遍，把这类问题挡在提交前。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

/** 抽出 `const NAME = \` … })();\`` 形式的片段（插件内联代码的固定形态）。 */
function extractSnippet(name) {
  const startTag = `const ${name} = \``
  const start = SRC.indexOf(startTag)
  if (start < 0) return null
  const from = start + startTag.length
  const close = SRC.indexOf('})();', from)
  if (close < 0) return null
  return SRC.slice(from, close + 5)
}

test('OVERVIEW_CODE 是完整的 IIFE 且可编译（防重复声明回归）', () => {
  const code = extractSnippet('OVERVIEW_CODE')
  assert.ok(code, 'expected OVERVIEW_CODE in lib/index.js')
  assert.ok(code.startsWith('return await (async () => {'), '必须是 IIFE 形态（编辑器命令空间执行要求）')
  assert.ok(code.endsWith('})();'), '必须以 })(); 收尾（截断会让整段无法编译）')
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(code)
  }, 'OVERVIEW_CODE 必须能作为函数体编译')
})

test('TRACE_CODE 是完整的 IIFE 且可编译', () => {
  const code = extractSnippet('TRACE_CODE')
  if (code === null) return // 片段被重命名时跳过，不误报
  assert.ok(code.endsWith('})();'))
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(code)
  })
})

test('内联片段里不得出现「箭头参数 x + 同作用域 let x」的遮蔽写法', () => {
  const code = extractSnippet('OVERVIEW_CODE') ?? ''
  assert.doesNotMatch(code, /\.map\(x\s*=>\s*\{[^}]*\blet\s+x\b/s, '参数名与局部变量重名会直接编译失败')
})
