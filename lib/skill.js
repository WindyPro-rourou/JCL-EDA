/**
 * dsh-lichuang-eda — 官方 EasyEDA skill 知识库查阅（eda_skill_read 数据源）。
 *
 * 官方 skill 知识文档已完整 vendored 在 <包根>/skill/ 下（SKILL.md 总纲、
 * README.official.md、README.zh-Hans.official.md、references/classes/*.md 逐类
 * API、references/enums|types|interfaces、guide/、user-guide/、format/）。本模块提供
 * 三类能力，让 agent 在对话里直接用工具读取任意官方文档（不依赖文件权限）：
 *   - resolveDoc(doc)：把用户给出的相对 doc 规范化并安全解析为 SKILL_ROOT 内的绝对路径；
 *   - readSkillDoc(doc, opts)：读取文档全文并支持按字符偏移分页；
 *   - listSkillDocs()：枚举全部可查阅文档（相对 SKILL_ROOT，按目录分组排序，上限 400）。
 *
 * 安全性：doc 会做正斜杠/去前导斜杠/normalize 规范化，拒绝含 '..' 或空字节的输入
 * （防路径穿越），且最终绝对路径必须位于 SKILL_ROOT 内且是存在的文件。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, normalize, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 官方 skill 知识根目录（<包根>/skill），基于本文件位置计算，不硬编码盘符。 */
export const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skill')

/** listSkillDocs 返回的文件数上限。 */
const MAX_DOCS = 400

/** 默认总览文档名（无 INDEX.md 时列表里以实际顶层 md 为准）。 */
const DEFAULT_DOC = 'INDEX.md'

/** 把绝对路径转成相对 SKILL_ROOT 的、用正斜杠分隔的文档路径。 */
function toRelSlash(absPath) {
  return relative(SKILL_ROOT, absPath).split(sep).join('/')
}

/**
 * 规范化并安全解析一个文档相对路径 → 返回 SKILL_ROOT 内存在的文件绝对路径；否则 null。
 *  - 正斜杠、去前导斜杠、normalize；
 *  - 含 '..' 或空字节 → null（防路径穿越）；
 *  - 最终路径必须位于 SKILL_ROOT 内且是存在的文件 → 否则 null。
 */
export function resolveDoc(doc = DEFAULT_DOC) {
  let d = typeof doc === 'string' ? doc : String(doc ?? '')
  d = d.replace(/\\/g, '/').replace(/^\/+/, '')
  if (d === '') return null // 显式空串无效（只有 undefined/缺省走 DEFAULT_DOC）
  if (d.includes('\0')) return null
  if (d.split('/').includes('..')) return null
  const norm = normalize(d) // 在 Windows 上产生反斜杠分隔
  if (norm.split(sep).includes('..')) return null
  const full = join(SKILL_ROOT, norm)
  const rel = relative(SKILL_ROOT, full)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  try {
    return statSync(full).isFile() ? full : null
  } catch {
    return null
  }
}

/**
 * 读取一份官方 skill 文档，支持按字符偏移分页。
 *  - doc 未命中 → { ok:false, error:'未知文档: <doc>（INDEX.md 可看总览）' }；
 *  - 命中 → { ok:true, doc, path, len, start, content, truncated, nextOffset }。
 */
export function readSkillDoc(doc, { offset = 0, maxChars = 12000 } = {}) {
  const effDoc = (typeof doc === 'string' && doc.trim() !== '') ? doc : DEFAULT_DOC
  const resolved = resolveDoc(doc)
  if (!resolved) {
    return { ok: false, error: `未知文档: ${effDoc}（${DEFAULT_DOC} 可看总览）` }
  }
  let text
  try {
    text = readFileSync(resolved, 'utf8')
  } catch (error) {
    return { ok: false, error: `读取失败: ${error instanceof Error ? error.message : String(error)}` }
  }
  const len = text.length
  const start = Number.isFinite(Number(offset)) && Number(offset) > 0 ? Math.floor(Number(offset)) : 0
  const sliceLen = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : 12000
  const end = Math.min(len, start + sliceLen)
  const content = text.slice(start, end)
  const truncated = end < len
  return {
    ok: true,
    doc: toRelSlash(resolved),
    path: resolved,
    len,
    start,
    content,
    truncated,
    nextOffset: end,
  }
}

/** 递归收集目录下的全部 .md（onlyTop=true 时仅列直接文件），返回相对 SKILL_ROOT 的数组。 */
function collectMd(dir, onlyTop) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (onlyTop) {
      if (e.isFile() && e.name.endsWith('.md')) out.push(toRelSlash(full))
    } else if (e.isDirectory()) {
      out.push(...collectMd(full, false))
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(toRelSlash(full))
    }
  }
  return out.sort()
}

/**
 * 枚举全部可查阅的官方 skill 文档（相对 SKILL_ROOT）。
 * 构成：顶层 .md（如 SKILL.md、README.official.md、README.zh-Hans.official.md）
 *      + references/classes/*.md 全部
 *      + references/enums、types、interfaces 下 md
 *      + references/ 下的索引（_index.md、_quick-reference.md）
 *      + guide、user-guide、format 下 md（含子目录）。
 * 按目录分组排序，最多 MAX_DOCS 条。
 */
export function listSkillDocs() {
  const groups = [
    { dir: SKILL_ROOT, onlyTop: true },
    { dir: join(SKILL_ROOT, 'references', 'classes'), onlyTop: false },
    { dir: join(SKILL_ROOT, 'references', 'enums'), onlyTop: false },
    { dir: join(SKILL_ROOT, 'references', 'types'), onlyTop: false },
    { dir: join(SKILL_ROOT, 'references', 'interfaces'), onlyTop: false },
    { dir: join(SKILL_ROOT, 'references'), onlyTop: true },
    { dir: join(SKILL_ROOT, 'guide'), onlyTop: false },
    { dir: join(SKILL_ROOT, 'user-guide'), onlyTop: false },
    { dir: join(SKILL_ROOT, 'format'), onlyTop: false },
  ]
  const files = []
  for (const g of groups) files.push(...collectMd(g.dir, g.onlyTop))
  return { count: Math.min(files.length, MAX_DOCS), files: files.slice(0, MAX_DOCS) }
}
