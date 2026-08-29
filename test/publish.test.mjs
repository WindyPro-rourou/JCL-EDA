/**
 * 发布脚本防回归测试：`node scripts/publish.mjs --dry` 必须
 *  - 成功（exit 0，输出「[dry] 未发布。校验通过。」）；
 *  - 包内断言全部通过（skill/lib/skill.js/cordis.patch.yml 等关键文件）；
 *  - 不把 scripts 带进暂存包（防 npm 生命周期递归）。
 * 这是 0.1.1 丢 skill/ 事故的回归护栏。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('publish.mjs --dry: 关键文件进包 + 无 scripts（回归护栏）', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'publish.mjs'), '--dry'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
  })
  assert.match(out, /\[dry\] 未发布。校验通过。/)
  // 显式 [check] 摘要行：每个关键文件都必须 ✓
  const checkLine = /\[check\] 关键文件: ([^\n]+)/.exec(out)?.[1] ?? ''
  assert.ok(checkLine.length > 0, '缺少 [check] 摘要行')
  for (const must of ['lib/skill.js', 'skill/SKILL.md', 'skill/INDEX.md', 'src/json-gen.js', 'cordis.patch.yml']) {
    assert.match(checkLine, new RegExp(`${must.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}✓`), `[check] 应包含 ${must}✓`)
  }
  assert.doesNotMatch(out, /未进包（中止）/, '不得触发 fail-fast')
})
