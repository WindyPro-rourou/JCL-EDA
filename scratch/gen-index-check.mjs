/**
 * 草稿：用 lib/skill.js 的 listSkillDocs() 校验官方 skill 全库，并生成一份
 * INDEX.md 候选（预览）写入 scratch/（不会覆盖 skill/INDEX.md）。
 *
 * 用途：
 *  1. 核对 listSkillDocs() 枚举的文档数（应 >100，且 ≤400）；
 *  2. 按顶层分组统计；
 *  3. 生成一份可人工替换 skill/INDEX.md 的候选（目录化导航）。
 *
 * 运行：node scratch/gen-index-check.mjs
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listSkillDocs, SKILL_ROOT } from '../lib/skill.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const { count, files } = listSkillDocs()

// 按顶层分组统计
const byTop = {}
for (const f of files) {
  const top = f.includes('/') ? f.split('/')[0] : f
  byTop[top] = (byTop[top] || 0) + 1
}

const lines = []
lines.push(`# 官方 EasyEDA Skill 知识库导航（自动生成候选）`)
lines.push(``)
lines.push(`> 由 scratch/gen-index-check.mjs 生成 · 文档总数 ${count} · 根目录: ${SKILL_ROOT}`)
lines.push(``)
lines.push(`## 顶层概览`)
lines.push(``)
lines.push(`- SKILL.md — 官方总纲`)
lines.push(`- INDEX.md — 本导航`)
lines.push(`- README.official.md / README.zh-Hans.official.md — 官方说明（英文/中文）`)
lines.push(``)
lines.push(`## 按目录分组（${count} 个文档）`)
lines.push(``)
for (const [group, n] of Object.entries(byTop).sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`### ${group}/（${n}）`)
  const groupFiles = files
    .filter((f) => (f.includes('/') ? f.split('/')[0] : f) === group)
    .sort()
  for (const f of groupFiles) lines.push(`- ${f}`)
  lines.push(``)
}

const out = join(HERE, 'INDEX.md.candidate')
writeFileSync(out, lines.join('\n'), 'utf8')

console.log(`count=${count}  unique=${new Set(files).size}`)
console.log(`byTop=${JSON.stringify(byTop, null, 0)}`)
console.log(`候选索引已写入: ${out}`)
console.log(count > 100 && count <= 400 ? 'CHECK OK' : 'CHECK FAILED（count 应在 100-400 之间）')
