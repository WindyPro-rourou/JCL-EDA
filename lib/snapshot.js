/**
 * dsh-lichuang-eda — 紧急保存（snapshot）核心。
 *
 * 「如果画板内容没同步上，用户手里也得有最后的工程」——把 agent 在画板上
 * 做的东西完整抓到本地：
 *
 *   1. 画板现场（需官方桥连接，官方 API）：
 *      - 当前工程信息 / 当前文档信息（dmt_Project / dmt_SelectControl）
 *      - 当前文档/工程文件 `.epro2`（专业版原生，完整恢复；SYS_FileManager.getDocumentFile）
 *      - 当前图页预览 `preview.svg`（通用：任何浏览器/标准版用户都能看）
 *      - 网表 `netlist.json` + BOM `bom.json`（sch_ManufactureData，供核对）
 *   2. agent 动作日志 `log.json`（服务端本就有：每次官方 API 调用记录；
 *      即使画板断连/未连接，最后步骤也能留档）
 *   3. `meta.json` + `README.txt`（打开方法：专业版恢复 / 标准版查看/重建）
 *
 * 设计原则：每一步独立失败（best-effort），一次失败绝不放弃整份快照；
 * 大结果有上限保护；全部写入 ~/.dsh/eda/snapshots/<project>-<stamp>/。
 *
 * 兼容性说明（如实）：官方导出仅 epro/epro2（专业版原生）与 PDF/PNG/SVG，
 * 无「标准版 v6 JSON」官方导出通道；因此快照 = 专业版完整恢复 +
 * 通用预览 + 数据文件。标准版可编辑需离线重建（仅简单电路，见
 * eda_generate_schematic_json / 对话内编排）。
 */

import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Default snapshot root (~/.dsh/eda/snapshots). */
export function defaultSnapshotDir() {
  return join(homedir(), '.dsh', 'eda', 'snapshots')
}

/** Per-execute timeout: the bridge itself dies at 30s, stay under it. */
export const STEP_TIMEOUT_MS = 25000
/** Refuse to write a doc payload larger than this (sanity guard). */
export const MAX_PAYLOAD_BYTES = 30 * 1024 * 1024

const PROJECT_INFO_CODE = 'return await eda.dmt_Project.getCurrentProjectInfo();'
const DOC_INFO_CODE = 'return await eda.dmt_SelectControl.getCurrentDocumentInfo();'

function docFileCode(baseName) {
  return `return await (async () => {
  const f = await eda.sys_FileManager.getDocumentFile('${baseName}');
  if (!f) return null;
  const text = await f.text();
  return { name: f.name, size: f.size, type: f.type, len: text.length, text };
})();`
}

function previewSvgCode(baseName) {
  return `return await (async () => {
  const f = await eda.sch_ManufactureData.getExportDocumentFile('${baseName}-preview', 'SVG', undefined, 'Current Schematic');
  if (!f) return null;
  const text = await f.text();
  return { name: f.name, size: f.size, len: text.length, text };
})();`
}

function netlistCode() {
  return `return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); return f ? await f.text() : null; })();`
}

function bomCode() {
  return `return await (async () => { const f = await eda.sch_ManufactureData.getBomFile(); if (!f) return null; const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return { name: f.name, size: f.size, b64: btoa(bin) }; })();`
}

/** Write BOM binary (base64 → bytes to disk as .xlsx). */
async function writeBom(outDir, files, addError, payload) {
  if (payload == null || typeof payload !== 'object' || typeof payload.b64 !== 'string' || payload.b64 === '') {
    addError('导出BOM', 'no bom file returned')
    return null
  }
  const buf = Buffer.from(payload.b64, 'base64')
  await fsp.mkdir(outDir, { recursive: true })
  const target = join(outDir, 'bom.xlsx')
  await fsp.writeFile(target, buf)
  files.push({ name: 'bom.xlsx', size: buf.length })
  return target
}

/** Parse a likely-JSON result string; return the original when it isn't. */
export function parseMaybeJson(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

/** Filesystem-safe base name (keeps CJK; drops path/illegal chars). */
export function sanitizeName(name) {
  const cleaned = String(name ?? 'eda-snapshot')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
    .trim()
  return cleaned.length > 0 && cleaned.length <= 64 ? cleaned : cleaned.slice(0, 64) || 'eda-snapshot'
}

/** The 紧急保存 pipeline. Never throws for per-step failures (returns errors[]). */
export async function createSnapshot(deps) {
  const {
    execute, // (code, timeoutMs) => Promise<{ok, result, error}>
    activities, // () => array (newest first) — agent action log
    connected, // whether the official bridge is connected now
    dir: dirOverride,
    now = () => new Date(),
    stepTimeoutMs = STEP_TIMEOUT_MS,
  } = deps

  const stamp = now().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = join(dirOverride ?? defaultSnapshotDir(), `snapshot-${stamp}`)
  const files = [] // { name, size }
  const errors = [] // degraded step descriptions
  const project = { info: null, doc: null, docFile: null, preview: null, netlist: null, bom: null }
  const addError = (label, message) => { errors.push(`${label}: ${message}`) }

  const execJson = async (label, code) => {
    try {
      const r = await execute(code, stepTimeoutMs)
      if (r?.ok) return parseMaybeJson(r.result)
      addError(label, (r?.error ?? 'execute failed').slice(0, 200))
      return null
    } catch (error) {
      addError(label, error instanceof Error ? error.message : String(error))
      return null
    }
  }

  async function writeFile(name, content) {
    if (typeof content !== 'string' || content === '') return null
    if (content.length > MAX_PAYLOAD_BYTES) {
      addError(`write ${name}`, `payload too large (${content.length} bytes)`)
      return null
    }
    await fsp.mkdir(outDir, { recursive: true })
    const target = join(outDir, name)
    await fsp.writeFile(target, content, 'utf8')
    files.push({ name, size: content.length })
    return target
  }

  // 1) board state — only when the bridge is actually connected.
  if (connected) {
    project.info = await execJson('工程信息', PROJECT_INFO_CODE)
    project.doc = await execJson('当前文档信息', DOC_INFO_CODE)

    const projectName = sanitizeName(
      project.info && typeof project.info === 'object' && (project.info.name ?? project.info.projectName)
        ? (project.info.name ?? project.info.projectName)
        : 'eda-snapshot',
    )
    const baseName = projectName.replace(/-$/, '')

    // 1a) native doc file (epro2) — the full-fidelity restore for 专业版.
    const docFile = await execJson('导出文档文件(epro2)', docFileCode(baseName))
    if (docFile && typeof docFile === 'object' && typeof docFile.text === 'string' && docFile.text !== '') {
      const ext = (typeof docFile.name === 'string' && docFile.name.includes('.')) ? docFile.name.split('.').pop() : 'epro2'
      project.docFile = { name: `${baseName}.${ext}` }
      await writeFile(`${baseName}.${ext}`, docFile.text)
    } else if (docFile === null && errors.length > 0) {
      // already recorded by execJson
    } else {
      addError('导出文档文件(epro2)', 'no document file returned (可能无打开文档/权限不足)')
    }

    // 1b) universal preview (SVG is text — saves cleanly, opens anywhere).
    const preview = await execJson('导出预览SVG', previewSvgCode(baseName))
    if (preview && typeof preview === 'object' && typeof preview.text === 'string' && preview.text !== '') {
      project.preview = { name: `${baseName}-preview.svg` }
      await writeFile(`${baseName}-preview.svg`, preview.text)
    } else if (preview === null && errors.length > 0) {
      // recorded
    } else {
      addError('导出预览SVG', 'no SVG returned (当前图页可能不是原理图)')
    }

    // 1c) data files for cross-checking (netlist/BOM are File objects — the
    // snippets above read f.text(), so keep the raw string on disk).
    const netlist = await execJson('导出网表', netlistCode())
    if (typeof netlist === 'string' && netlist !== '') {
      project.netlist = { name: 'netlist.json' }
      await writeFile('netlist.json', netlist)
    } else if (netlist != null && typeof netlist === 'object') {
      project.netlist = { name: 'netlist.json' }
      await writeFile('netlist.json', JSON.stringify(netlist, null, 2))
    } else if (netlist == null) {
      addError('导出网表', 'no netlist file returned')
    }
    const bom = await execJson('导出BOM', bomCode())
    if (typeof bom === 'object' && bom !== null && typeof bom.b64 === 'string') {
      project.bom = { name: 'bom.xlsx' }
      await writeBom(outDir, files, addError, bom)
    } else if (typeof bom === 'object' && bom !== null && Object.keys(bom).length > 0) {
      // Non-binary BOM payload (some netlist-like providers) — keep as JSON.
      project.bom = { name: 'bom.json' }
      await writeFile('bom.json', JSON.stringify(bom, null, 2))
    } else if (bom == null) {
      addError('导出BOM', 'no bom file returned')
    }
  } else {
    addError('画板现场', '官方桥未连接——仅保存 agent 动作日志（步骤留档）')
  }

  // 2) agent action log — always (server-side, no bridge needed).
  let logEntries = []
  try { logEntries = Array.isArray(activities()) ? activities() : [] } catch { /* keep empty */ }
  await writeFile('log.json', JSON.stringify({ entries: logEntries.slice(0, 200) }, null, 2) + '\n')

  // 3) meta + README (last two writes; meta.files covers the whole bundle).
  const bridgeInfo = project.info ?? null
  const allFileNames = [...files.map((f) => f.name), 'meta.json', 'README.txt']
  const meta = {
    kind: 'dsh-eda-snapshot',
    createdAt: now().toISOString(),
    project: project.info ?? null,
    document: project.doc ?? null,
    connected,
    files: allFileNames,
    errors,
  }
  await writeFile('meta.json', JSON.stringify(meta, null, 2) + '\n')

  const readme = [
    `# 紧急保存快照 — ${sanitizeName(bridgeInfo && typeof bridgeInfo === 'object' ? (bridgeInfo.name ?? '') : '') || 'EDA 快照'}`,
    '',
    `生成时间: ${meta.createdAt}  来源: dsh-lichuang-eda（官方桥 ${connected ? '已连接' : '未连接'}）`,
    '',
    '## 打开方法（pro 与普通都兼容）',
    `1. **专业版**（嘉立创EDA专业版 / pro.lceda.cn）：文件 → 打开（或把文件拖入编辑器）选择 ${(project.docFile?.name ?? '.epro2 文件')} 即可完整恢复 agent 的全部改动。`,
    `2. **普通/标准版**（EasyEDA 网页标准版）：无法直接打开 .epro2；请双击 ${(project.preview?.name ?? 'preview.svg')} 用浏览器查看（通用预览），或把网表/BOM 数据交给 AI 用离线生成器重建（仅支持简单电路）。`,
    '',
    '## 文件清单',
    ...meta.files.map((f) => `- ${f}`),
    '',
    '## 说明',
    '- .epro2 为专业版原生格式（官方 API 仅能导出 epro/epro2 与 PDF/PNG/SVG，无标准版 JSON 通道），因此"pro 完整恢复 + 通用预览 + 数据文件"是官方能力下的最佳组合。',
    '- log.json 记录 agent 每次官方 API 调用（放元件/连线/DRC/网表…），画板断连也能保留步骤。',
    ...(errors.length > 0 ? ['', '## 本次降级项', ...errors.map((e) => `- ${e}`)] : []),
    '',
  ].join('\n')
  await writeFile('README.txt', readme)

  return {
    ok: true,
    dir: outDir,
    files,
    errors,
    connected,
    project: project.info,
    document: project.doc,
    docFile: project.docFile?.name ?? null,
    preview: project.preview?.name ?? null,
  }
}
