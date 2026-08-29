/**
 * dsh-lichuang-eda — host half.
 *
 * 嘉立创 EDA 助手：面向 0 基础开发者，自动生成嘉立创 EDA（专业版/标准版）
 * 原理图 / PCB 草图的 DSH 插件。
 *
 * Based on the OFFICIAL EasyEDA ecosystem only:
 *   - offline generator (标准版 JSON): 中文需求/模板 → design → 原理图 JSON，
 *     带结构 + 连通性校验（src/validate.js）；
 *   - live bridge (OFFICIAL): easyeda-api-skill 的官方 Bridge Server
 *     （scripts/bridge-server.mjs，端口 49620-49629）+ 官方扩展 Run API Gateway
 *     （EasyEDA Pro 内，需勾「允许外部交互」），动作 = 官方 eda.* API 代码执行；
 *   - routes: /status /templates /bridge /install /generate；
 *   - system-prompt announcement + browser panel (./client).
 *
 * 所有外部后端均来自官方（easyeda/easyeda-api-skill 与 easyeda/eext-run-api-gateway），
 * 无任何第三方后端（easyeda-agent / jlcmcp / easyeda-mcp-pro 已弃用）。
 */

import { readFileSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { EdaBackend, OFFICIAL_CODES, BRIDGE_PORTS } from './backend.js'
import { installOfficialBridge, isBridgeInstalled, bridgeDir, bridgeScriptPath, OFFICIAL_EXT_URL } from './installer.js'
import { createSnapshot } from './snapshot.js'
import { pickSpots } from './layout.js'
import { ActivityLog } from './activity.js'
import { CAPABILITIES } from './capabilities.js'
import { generateSchematic, wrapAsProject } from '../../src/json-gen.js'
import { validateSchematic, checkConnectivity, deriveNetlist } from '../../src/validate.js'
import { translateRequest, TEMPLATE_CATALOG, describeDesign } from '../../src/nl-to-design.js'

/** This package's manifest (name + version), read from the installed location. */
const OWN_MANIFEST = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** Stable cordis plugin name. */
export const name = 'eda'

/** Services required before the eda surfaces can mount. */
export const inject = ['webServer', 'tools', 'systemPrompt']

/** Services this plugin provides on ctx (ctx.eda). */
export const provide = ['eda']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 153

/** Where generated files are written (stable across install locations). */
function outputRoot() {
  return join(homedir(), '.dsh', 'eda', 'output')
}

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const EDA_GUIDANCE =
  '本机已安装 dsh-lichuang-eda 插件（嘉立创 EDA 助手）：本插件是「平台层」——提供官方桥的装/启/连/状态，以及执行官方 eda.* API 的双手；「生成电路图」这类编排请在对话里直接进行（skill 式直觉）。' +
  '当用户说「嘉立创EDA，启动！」/「帮我画一个…电路」且已连接时，按此流程做：① `eda_status` 确认官方桥 connected（未连则 `eda_backend_connect`）；② 用 `eda_exec` 逐步执行官方 eda.* API 在用户的云端画板上实时生成（放元件→连线→网络标签→DRC/网表/BOM），' +
  '官方案例/参数在 ~/.dsh/eda/bridge/（docs、user-guide、guide、format 目录为官方文档，先用 read 查阅再调用）；③ 每步 `eda_exec` 后返回结果/错误，必要时 `eda_sch_drc` 校验。' +
  '工具：eda_status（状态）、eda_bridge_install（一键装官方桥）、eda_backend_connect（启动/连接官方桥）、eda_exec（执行任意官方 eda.* 代码——云端实时生成的双手）、eda_pick_spot（**框内定位**：读页面尺寸+已有图元→返回互不冲突的框内网格空位；放元件前先调用）、eda_snapshot（**紧急保存**：画板现场 .epro2 + 预览 SVG + 网表/BOM + agent 动作日志 → ~/.dsh/eda/snapshots/，断连也能留档）、' +
  'eda_sch_drc / eda_get_netlist / eda_get_bom（校验/导出，需连接）、eda_generate_schematic_json（**离线兜底**：本地生成可导入的标准版 JSON，写入 ~/.dsh/eda/output/；仅在无法连接画板时使用，连接时一律走官方 API 云端实时）、' +
  'eda_template_list / eda_translate_request（模板与需求翻译，供离线/兜底使用）。' +
  '**放置定位（硬规则，禁止乱放）**：原理图坐标单位 10mil、图纸 A4≈1170×825，放置前必须先 `eda_exec` 读页面尺寸（dmt_Project.getCurrentProjectInfo()→titleBlockData.Width/Height）与已有图元位置（sch_PrimitiveComponent.getAll()+getState_X/Y 在代码内映射），只放**图框内边距≥80、网格 100 步进、与已有图元间距≥150**的空位（或直接调 eda_pick_spot）；导线用 getAllPinsByPrimitiveId 取真实引脚坐标后画水平/垂直线段（只连引脚）。PCB 坐标单位 1mil，同样读已有焊盘（getAllPins）后居中布件、焊盘级走线。' +
  '**已知缺陷与技巧（实测，勿踩坑）**：`pcb_Document.importChanges` 与 `pcb_Net.setNetlist` 实测不可靠（勿用于网表同步）；`sch_Netlist.getNetlist` 与 `pcb_Net.getNetlist("EasyEDA")` 会挂起（网表一律用 `sch_ManufactureData.getNetlistFile` 并 `await f.text()`）；`getBomFile` 返回二进制 xlsx（arrayBuffer→base64 处理）；DRC 用 `check(true,false,true)` 拿详情；`sch_PrimitiveComponent.getAll` 间歇失败需重试；PCB 板框（layer 11）官方无绘制 API（人工/导入）。' +
  '**主动协作（能力入口）**：你能主动为用户完成——读工程/文档、放任意大类元件（搜库→定位→放置）、引脚级连线、网络标志/端口、DRC、网表/BOM 导出、PCB 元件/过孔/走线、现场截图、紧急保存。规划任务时若不确定某个 API 是否存在或怎么调，先调 `eda_capabilities`（结构化能力清单+注意事项+实测片段），再用 `eda_exec` 落地；用户提到画板相关需求时主动提议并执行，不要等用户一字一句教。' +
  '限制：v0 离线生成器仅支持 电阻/LED；云端实时生成能力由官方 eda.* API 决定（以 ~/.dsh/eda/bridge 内官方文档为准）。' +
  '用户提到「嘉立创 / 立创EDA / 原理图 / PCB草图 / 生成电路图」时即指本插件，请据此主动协作。'

/** -------------------------------------------------------------- helpers */

const API_BASE = '/api/dsh-eda'

/** -------------------------------------------------------------- activity */

/**
 * Record-style timeline (参考 DSH 轨迹): every step is one entry, persisted to
 * ~/.dsh/eda/activity.jsonl (survives restarts — the panel is never empty),
 * with optional per-step revoke data (the primitives that step created).
 * Wrappers keep historical call sites; `activityLog` is bound at apply().
 */
let activityLog = null
function pushActivity(entry) { return activityLog?.push(entry) ?? 0 }
function pushPendingActivity(entry) { return activityLog?.push({ status: 'pending', durationMs: 0, ...entry }) ?? 0 }
function updateActivity(id, patch) { activityLog?.update(id, patch) }
function activityFeed(opts) { return activityLog?.feed(opts) ?? { currentSid: '', sessions: [], activities: [] } }

/** Snapshot the current document's primitive ids (for 撤回 diff). */
async function captureDocumentIds(backend) {
  const CODE = `return await (async () => {
    const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
    const domain = info?.documentType === 3 ? 'pcb' : 'sch';
    const out = { domain };
    try {
      if (domain === 'sch') {
        out.component = await eda.sch_PrimitiveComponent.getAllPrimitiveId();
        out.wire = await eda.sch_PrimitiveWire.getAllPrimitiveId();
      } else {
        out.component = await eda.pcb_PrimitiveComponent.getAllPrimitiveId();
        out.via = await eda.pcb_PrimitiveVia.getAllPrimitiveId();
        out.line = await eda.pcb_PrimitiveLine.getAllPrimitiveId();
      }
    } catch { /* partial snapshot is fine */ }
    return out;
  })();`
  const r = await backend.execute(CODE, 25000)
  if (!r.ok) return null
  try { return JSON.parse(r.result) } catch { return null }
}

/** Diff two id snapshots → created ids + deleted count (for 撤回). */
export function diffIds(before, after) {
  if (!before || !after) return null
  const keys = ['component', 'wire', 'via', 'line']
  const created = []
  let deletedCount = 0
  for (const key of keys) {
    const a = before[key] ?? []
    const b = after[key] ?? []
    const setA = new Set(a)
    const setB = new Set(b)
    for (const id of b) if (!setA.has(id)) created.push({ type: key, id })
    for (const id of a) if (!setB.has(id)) deletedCount++
  }
  return { domain: after.domain ?? before.domain ?? 'sch', created, deletedCount }
}

/**
 * Session id of the agent that triggered one tool call. The tool runtime hands
 * every `execute(args, exec)` a ToolRunContext carrying `agent.id`
 * (= its SessionId), so the monitor can answer 「仅当前会话」honestly.
 * '' = unknown / panel-clicked (platform-level).
 */
function sessionIdOf(exec) {
  try {
    const id = exec?.agent?.id ?? exec?.agent?.session?.id
    return typeof id === 'string' && id !== '' ? id : ''
  } catch {
    return ''
  }
}

/** Human-readable (Chinese) label for an official eda.* code snippet. */
function describeEdaAction(code) {
  const m = /eda\.([a-zA-Z_]+)\.([a-zA-Z_]+)/.exec(code ?? '')
  if (!m) return '执行官方代码'
  const [, mod, fn] = m
  const map = {
    'dmt_Project.getCurrentProjectInfo': '读取当前工程',
    'dmt_Project.openProject': '打开工程',
    'dmt_Schematic.createSchematic': '新建原理图',
    'dmt_Schematic.createSchematicPage': '新建原理图页',
    'dmt_EditorControl.openDocument': '打开文档',
    'dmt_EditorControl.activateDocument': '激活文档',
    'dmt_SelectControl.getCurrentDocumentInfo': '读取当前文档信息',
    'sch_PrimitiveComponent.create': '放置元件',
    'sch_PrimitiveComponent.createNetFlag': '放置网络标志',
    'sch_PrimitiveComponent.createNetPort': '放置网络端口',
    'sch_PrimitiveWire.create': '画导线',
    'sch_Document.save': '保存原理图',
    'sch_Drc.check': '原理图 DRC',
    'sch_ManufactureData.getNetlistFile': '导出网表',
    'sch_ManufactureData.getBomFile': '导出 BOM',
    'pcb_Document.importAutoRouteJsonFile': '导入自动布线',
    'pcb_Drc.check': 'PCB DRC',
    'lib_Device.searchByProperties': '按料号搜索器件',
    'lib_Device.search': '搜索器件',
  }
  return map[`${mod}.${fn}`] ?? `调用 ${mod}.${fn}()`
}

/** Loopback-only guard (simplified from dsh-logcat): refuses non-local callers. */
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress ?? ''
  if (address === '') return true // no socket info (tests / some proxies) — allow
  if (address === '::1' || address === '127.0.0.1') return true
  return address.startsWith('::ffff:127.') || address.startsWith('127.')
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req, limitBytes = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

/** Shared offline generation pipeline (tool + route). */
async function generateSchematicJson({ description = '', template = '' } = {}) {
  const t = translateRequest(description, { template })
  if (!t.ok) return { ok: false, error: t.note ?? '无法翻译需求' }
  let sheet
  try {
    sheet = generateSchematic(t.design)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const project = wrapAsProject(sheet, { title: t.design.name, description: t.note ?? '' })
  const struct = validateSchematic(sheet)
  const conn = checkConnectivity(t.design)
  const netlist = deriveNetlist(t.design)

  const files = []
  try {
    const dir = outputRoot()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const base = `${t.design.name}-${stamp}`
    await fsp.mkdir(dir, { recursive: true })
    const flatPath = join(dir, base + '.json')
    const projPath = join(dir, base + '-project.json')
    await fsp.writeFile(flatPath, JSON.stringify(sheet, null, 2) + '\n', 'utf8')
    await fsp.writeFile(projPath, JSON.stringify(project, null, 2) + '\n', 'utf8')
    files.push(flatPath, projPath)
  } catch { /* file write is best-effort */ }

  return {
    ok: true,
    title: t.title,
    note: t.note ?? '',
    components: t.design.components.map((c) => `${c.ref}: ${c.type} ${c.value}`),
    netSummary: describeDesign(t.design),
    nets: netlist.nets.filter((n) => n.name !== null).map((n) => n.name),
    structureOk: struct.ok,
    connectivityOk: conn.ok,
    errors: [...struct.errors, ...conn.errors].slice(0, 20),
    json: JSON.stringify(sheet),
    projectJson: JSON.stringify(project),
    files,
  }
}

/** Enriched status snapshot for the handle / routes / eda_status tool. */
function statusOf(backend) {
  const b = backend.status()
  return {
    ready: b.running && b.connected,
    backend: b.backend,
    state: b.state,
    connected: b.running && b.connected,
    port: b.port ?? 0,
    health: b.health ?? '',
    offlineCapable: true,
    supportedTypes: ['resistor', 'led'],
    bridgeInstalled: isBridgeInstalled(),
    bridgeScript: isBridgeInstalled() ? bridgeScriptPath() : '',
    extUrl: OFFICIAL_EXT_URL,
    error: b.error ?? '',
    version: OWN_MANIFEST.version,
    note: b.connected
      ? `官方桥已连接（127.0.0.1:${b.port}）：可实时执行官方 eda.* API（放元件/连线/DRC/网表/BOM）`
      : '官方桥未连接（离线生成仍可用）。一键流程：①「一键安装官方桥」→ ②「启动桥」→ ③ EasyEDA Pro 装官方扩展 Run API Gateway 并勾选「允许外部交互」→ ④ 状态变绿。',
  }
}

/** Start (or reuse) the official bridge; shared by the tool and the /bridge route. */
async function startBridge(backend) {
  if (!isBridgeInstalled()) {
    return { ok: false, state: 'idle', error: '官方桥未安装：请先用 eda_bridge_install（或面板「一键安装官方桥」）下载官方 easyeda-api-skill。', note: '' }
  }
  if (backend.isRunning()) return { ok: true, state: backend.state, error: '', note: '官方桥已在运行' }
  const st = await backend.start()
  return {
    ok: st.running,
    state: st.state,
    error: st.error ?? '',
    note: st.running
      ? `官方桥已启动（${st.port ? '127.0.0.1:' + st.port : '等待 49620-49629'}）。请确认 EasyEDA Pro 已安装官方扩展「Run API Gateway」并勾选「允许外部交互」。`
      : '官方桥未启动：请先「一键安装官方桥」（eda_bridge_install），并确认 EasyEDA Pro 已装 Run API Gateway 扩展 + 勾选「允许外部交互」。',
  }
}

/** -------------------------------------------------------------- routes */

function makeRoutes(handle) {
  const routes = [
    {
      kind: 'exact',
      path: API_BASE + '/status',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
        await handle.backend.refresh() // live health snapshot (not stale)
        writeJson(res, 200, handle.status())
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/activity',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
        const query = (req.url ?? '').split('?')[1] ?? ''
        const sid = new URLSearchParams(query).get('sid') ?? ''
        writeJson(res, 200, activityFeed({ sid }))
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/activity/clear',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        try {
          await handle.clearActivity()
          pushActivity({ sid: '', tool: 'panel', action: '清空记录', ok: true, result: '时间线已清空' })
          writeJson(res, 200, { ok: true })
        } catch (error) { writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/activity/revoke',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        try {
          const query = (req.url ?? '').split('?')[1] ?? ''
          const id = Number(new URLSearchParams(query).get('id') ?? 0)
          writeJson(res, 200, await handle.revokeActivity(id))
        } catch (error) { writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/templates',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
        writeJson(res, 200, { templates: TEMPLATE_CATALOG })
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/bridge',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        try {
          const t0 = Date.now()
          const out = await startBridge(handle.backend)
          pushActivity({
            sid: '', tool: 'panel',
            action: out.ok ? '启动官方桥（面板）' : '启动官方桥（面板失败）',
            ok: out.ok, error: out.ok ? '' : (out.error ?? out.note ?? ''),
            durationMs: Date.now() - t0,
          })
          writeJson(res, 200, out)
        } catch (error) { writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/install',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        try {
          const out = await handle.bridgeInstall(await readJsonBody(req))
          pushActivity({
            sid: '', tool: 'panel',
            action: out.ok ? '一键安装官方桥（面板）' : '一键安装官方桥（面板失败）',
            ok: out.ok === true,
            error: out.ok ? '' : String(out.error ?? ''),
            result: out.ok ? String(out.script ?? '') : '',
          })
          writeJson(res, 200, out)
        } catch (error) { writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/generate',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        try { writeJson(res, 200, await generateSchematicJson(await readJsonBody(req))) }
        catch (error) { writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
      },
    },
    {
      kind: 'exact',
      path: API_BASE + '/snapshot',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
        if ((req.method ?? 'GET') !== 'POST') { writeJson(res, 405, { error: 'method not allowed' }); return }
        try {
          const t0 = Date.now()
          const out = await handle.snapshot(await readJsonBody(req))
          pushActivity({
            sid: '', tool: 'panel',
            action: out.connected ? '紧急保存（画板现场+日志）' : '紧急保存（仅动作日志）',
            ok: out.ok === true,
            result: out.ok ? `${out.dir}（${out.files.length} 个文件${out.errors.length > 0 ? `，${out.errors.length} 项降级` : ''}）` : '',
            error: out.ok ? '' : String(out.error ?? ''),
            durationMs: Date.now() - t0,
          })
          writeJson(res, 200, out)
        } catch (error) { writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
      },
    },
  ]
  return { routes }
}

/** -------------------------------------------------------------- tools */

function edaStatusTool(handle) {
  return defineTool({
    name: 'eda_status',
    description: 'Check the dsh-lichuang-eda (嘉立创 EDA 助手) plugin status: official bridge state, offline generator capability. ' +
      'Triggers: check eda plugin status, ask whether the 嘉立创 EDA 后端已接入, decide whether schematic / PCB generation is available.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ready: { type: 'boolean', required: true },
          backend: { type: 'string', required: true },
          state: { type: 'string' },
          connected: { type: 'boolean' },
          port: { type: 'integer' },
          health: { type: 'string' },
          offlineCapable: { type: 'boolean' },
          supportedTypes: { type: 'array', items: { type: 'string' } },
          bridgeInstalled: { type: 'boolean' },
          bridgeScript: { type: 'string' },
          extUrl: { type: 'string' },
          error: { type: 'string' },
          version: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const ready = value?.ready === true
        const lines = [
          `嘉立创 EDA 助手: ${ready ? '就绪' : '未就绪'}`,
          `backend: ${value?.backend ?? 'unknown'}`,
          `官方桥: ${value?.bridgeInstalled ? '已安装' : '未安装'}${value?.port ? ' · 端口 ' + value.port : ''}`,
          `离线生成: ${value?.offlineCapable ? '可用' : '不可用'}`,
        ]
        if (value?.note !== '' && value?.note != null) lines.push(`note: ${value.note}`)
        if (value?.version != null && value.version !== '') lines.push(`version: ${value.version}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute() {
      await handle.backend.refresh() // live health snapshot (not stale)
      return handle.status()
    },
  })
}

function edaTemplateListTool() {
  return defineTool({
    name: 'eda_template_list',
    description: 'List the common-circuit template cards (built-in pointing-and-choosing wall) with their supported flag. ' +
      'Triggers: which templates exist, 有哪些模板, 能生成什么电路.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          templates: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                ico: { type: 'string' },
                name: { type: 'string', required: true },
                desc: { type: 'string' },
                supported: { type: 'boolean' },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const rows = (value?.templates ?? []).map((t) => `${t.supported ? '✅' : '⏳'} ${t.name}（${t.id}）：${t.desc ?? ''}`)
        return [{ type: 'text', text: rows.length > 0 ? rows.join('\n') : '(no templates)' }]
      },
    },
    async execute() {
      return { templates: TEMPLATE_CATALOG.map((t) => ({ id: t.id, ico: t.ico, name: t.name, desc: t.desc, supported: t.supported === true })) }
    },
  })
}

function edaTranslateRequestTool() {
  return defineTool({
    name: 'eda_translate_request',
    description: 'Translate a Chinese circuit request into a structured design draft (components + wires + nets) WITHOUT generating. ' +
      'Use first to preview what the plugin understood. Triggers: 把需求翻译成电路设计草稿, preview design before generate.',
    parameters: {
      description: { type: 'string', description: '中文需求，例如：一个 LED 点亮电路 / 5V→3.3V 电阻分压' },
      template: { type: 'string', description: '可选：模板 ID（见 eda_template_list）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          title: { type: 'string', required: true },
          note: { type: 'string' },
          summary: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const lines = [`翻译: ${value?.ok ? '成功' : '未命中'}`]
        if (value?.title != null) lines.push(`标题: ${value.title}`)
        if (value?.summary != null) lines.push(value.summary)
        if (value?.note != null && value.note !== '') lines.push(`提示: ${value.note}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const t = translateRequest(args?.description ?? '', { template: args?.template })
      if (!t.ok) return { ok: false, title: t.title, note: t.note }
      return { ok: true, title: t.title, summary: describeDesign(t.design), note: t.note ?? '' }
    },
  })
}

function edaGenerateSchematicJsonTool() {
  return defineTool({
    name: 'eda_generate_schematic_json',
    description: 'Generate an importable 嘉立创 EDA 标准版 (EasyEDA Standard v6) schematic JSON from a Chinese request or template id. ' +
      'Runs offline (no board connection needed); validates structure + connectivity; writes files to ~/.dsh/eda/output/. ' +
      'Triggers: 生成原理图 JSON, 生成能导入嘉立创的电路图文件.',
    parameters: {
      description: { type: 'string', description: '中文需求（与 template 二选一）' },
      template: { type: 'string', description: '模板 ID（见 eda_template_list；与 description 二选一）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          title: { type: 'string' },
          note: { type: 'string' },
          components: { type: 'array', items: { type: 'string' } },
          nets: { type: 'array', items: { type: 'string' } },
          structureOk: { type: 'boolean' },
          connectivityOk: { type: 'boolean' },
          errors: { type: 'array', items: { type: 'string' } },
          json: { type: 'string' },
          projectJson: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const lines = value?.ok === false
          ? [`生成失败: ${value?.error ?? '?'}`]
          : [
              `✅ 已生成「${value?.title ?? ''}」标准版原理图 JSON`,
              `元件: ${(value?.components ?? []).join(', ') || '无'}`,
              `网络: ${(value?.nets ?? []).join(', ') || '无'}`,
              `结构校验: ${value?.structureOk ? '通过' : '失败'} · 连通性: ${value?.connectivityOk ? '通过' : '失败'}`,
            ]
        if ((value?.errors ?? []).length > 0) lines.push(`校验错误: ${value.errors.slice(0, 5).join('; ')}`)
        if ((value?.files ?? []).length > 0) lines.push(`已写入: ${value.files.join(', ')}`)
        if (value?.note != null && value.note !== '') lines.push(`提示: ${value.note}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      return generateSchematicJson({ description: args?.description, template: args?.template })
    },
  })
}

/** One-click download/install of the OFFICIAL bridge (easyeda-api-skill). */
function edaBridgeInstallTool(backend) {
  return defineTool({
    name: 'eda_bridge_install',
    description: 'One-click download + install the OFFICIAL EasyEDA bridge (easyeda/easyeda-api-skill) into ~/.dsh/eda/bridge/ ' +
      '(source archive → extract → npm install → scripts/bridge-server.mjs). No third-party backend involved. ' +
      'Triggers: 一键安装官方桥, download official bridge, 装官方桥.',
    parameters: {
      version: { type: 'string', description: '可选：branch/tag，默认 main（官方仓库）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string' },
          script: { type: 'string' },
          extUrl: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => ({ type: 'text', text: value?.ok ? (value.message ?? '安装完成') : `安装失败: ${value?.error ?? '?'}` }),
    },
    async execute(args, exec) {
      const sid = sessionIdOf(exec)
      const id = pushPendingActivity({ sid, tool: 'eda_bridge_install', action: '一键安装官方桥（进行中）' })
      try {
        const t0 = Date.now()
        const r = await installOfficialBridge({ version: args?.version })
        updateActivity(id, { status: 'done', ok: true, result: r.script, durationMs: Date.now() - t0 })
        return {
          ok: true,
          message: `官方桥已安装: ${r.script}\n请在 EasyEDA Pro「扩展管理」安装官方扩展 Run API Gateway（${r.extUrl}）并勾选「允许外部交互」。`,
          script: r.script,
          extUrl: r.extUrl,
          error: '',
        }
      } catch (error) {
        updateActivity(id, { status: 'error', ok: false, error: error instanceof Error ? error.message : String(error) })
        return { ok: false, message: '', script: '', extUrl: OFFICIAL_EXT_URL, error: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

function edaBackendConnectTool(handle, backend) {
  return defineTool({
    name: 'eda_backend_connect',
    description: 'Start the OFFICIAL EasyEDA bridge server (easyeda-api-skill scripts/bridge-server.mjs, listens 127.0.0.1:49620-49629) and wait for health. ' +
      'Requires the official extension Run API Gateway in EasyEDA Pro with 「允许外部交互」 enabled. ' +
      'Triggers: 连接专业版画板, connect the board, 启动官方桥, start bridge.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          state: { type: 'string' },
          error: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => ({
        type: 'text',
        text: value?.ok === false
          ? `启动失败: ${value?.error ?? '?'}\n${value?.note ?? ''}`
          : `官方桥: ${value?.state ?? '?'}\n${value?.note ?? ''}`,
      }),
    },
    async execute(_args, exec) {
      const sid = sessionIdOf(exec)
      const id = pushPendingActivity({ sid, tool: 'eda_backend_connect', action: '启动/连接官方桥（进行中）' })
      const t0 = Date.now()
      const st = await startBridge(backend)
      updateActivity(id, {
        status: st.ok ? 'done' : 'error',
        ok: st.ok,
        action: st.ok ? '启动/连接官方桥' : '启动官方桥（失败）',
        error: st.ok ? '' : (st.error ?? st.note ?? ''),
        durationMs: Date.now() - t0,
      })
      return { ok: st.ok, state: st.state, error: st.error, note: st.note }
    },
  })
}

/** Bridge-gated validation tools over the OFFICIAL eda.* API (execute snippets). */
function bridgeTool(handle, backend, spec) {
  const { name, description, bridgeToolName, renderSummary } = spec
  return defineTool({
    name,
    description,
    parameters: {
      args: { type: 'string', description: '可选：JSON 参数串（如 {"code":"return await eda.xxx()"}，用官方 eda.* 代码覆盖默认映射）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          result: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => ({ type: 'text', text: value?.ok ? renderSummary(value.result) : `失败: ${value?.error ?? '?'}` }),
    },
    async execute(args, exec) {
      const sid = sessionIdOf(exec)
      let params = {}
      if (typeof args?.args === 'string' && args.args !== '') {
        try { params = JSON.parse(args.args) } catch { /* ignore bad JSON */ }
      }
      const codeUsed = params?.code ?? OFFICIAL_CODES[bridgeToolName] ?? ''
      const label = describeEdaAction(codeUsed) + `（${name}）`
      await backend.refresh() // live facts before gating
      const st = statusOf(backend)
      if (!st.connected) {
        pushActivity({ sid, tool: name, action: label, code: codeUsed, ok: false, error: '官方桥未连接（门控拦截）' })
        return { ok: false, error: '官方桥未连接：请先一键安装/启动官方桥，并确认 EasyEDA Pro 已装 Run API Gateway 扩展、勾选「允许外部交互」。' }
      }
      const id = pushPendingActivity({ sid, tool: name, action: label, code: codeUsed })
      const t0 = Date.now()
      const res = await backend.callTool(bridgeToolName, params)
      updateActivity(id, {
        status: res.ok ? 'done' : 'error',
        ok: res.ok,
        result: res.ok ? res.result : '',
        error: res.ok ? '' : res.error,
        durationMs: Date.now() - t0,
      })
      return res.ok ? { ok: true, result: res.result } : { ok: false, error: res.error }
    },
  })
}

/** 撤回一个步骤：删除该步新建的图元（按类型分域调用官方 delete）。 */
async function revokeActivityEntry(backend, id) {
  const entry = activityLog?.get(Number(id))
  if (!entry) return { ok: false, error: `步骤 #${id} 不存在` }
  const rv = entry.revoke
  if (!rv || !Array.isArray(rv.created) || rv.created.length === 0) {
    return { ok: false, error: '该步骤没有可撤回的新建图元（仅 eda_exec/创建类步骤可撤回）' }
  }
  const byType = {}
  for (const c of rv.created) (byType[c.type] ??= []).push(c.id)
  const domain = rv.domain === 'pcb' ? 'pcb' : 'sch'
  const calls = []
  if (domain === 'sch') {
    if (byType.component?.length) calls.push(`await eda.sch_PrimitiveComponent.delete(${JSON.stringify(byType.component)});`)
    if (byType.wire?.length) calls.push(`await eda.sch_PrimitiveWire.delete(${JSON.stringify(byType.wire)});`)
  } else {
    if (byType.component?.length) calls.push(`await eda.pcb_PrimitiveComponent.delete(${JSON.stringify(byType.component)});`)
    if (byType.via?.length) calls.push(`await eda.pcb_PrimitiveVia.delete(${JSON.stringify(byType.via)});`)
    if (byType.line?.length) calls.push(`await eda.pcb_PrimitiveLine.delete(${JSON.stringify(byType.line)});`)
  }
  if (calls.length === 0) return { ok: false, error: '无可撤回的图元类型' }
  const r = await backend.execute(`return await (async () => { ${calls.join(' ')} return true; })();`, 30000)
  if (!r.ok) return { ok: false, error: r.error }
  const removed = rv.created.length
  const note = rv.deletedCount > 0 ? `（该步另删除 ${rv.deletedCount} 个图元，无法自动恢复）` : ''
  pushActivity({ sid: '', tool: 'panel', action: `撤回步骤 #${entry.id}「${entry.action ?? '官方 API 调用'}」`, ok: true, result: `已删除 ${removed} 个新建图元${note}` })
  return { ok: true, removed, note: note || '已删除该步新建的全部图元' }
}

/** The hands for the conversation-driven (skill-style) generation: execute any
 *  official `eda.*` code through the connected bridge, right in the user's
 *  cloud board. */
function edaExecTool(backend) {
  return defineTool({
    name: 'eda_exec',
    description: 'Execute official 嘉立创 EDA eda.* API code in the user\'s connected cloud board (via the official bridge). ' +
      'This is THE tool to draw/edit/route in the live board — place components, wires, net labels, run DRC, export, etc. ' +
      'Reference docs are vendored at ~/.dsh/eda/bridge/ (docs/ user-guide/ guide/ format/ — read first, then call). ' +
      'Triggers: 在画板上放元件, draw wire, 云端画图, 执行 eda.* 代码, exec eda.',
    parameters: {
      code: { type: 'string', description: '官方 eda.* JS 代码，例如 return await eda.dmt_Project.getCurrentProjectInfo();' },
      args: { type: 'string', description: '可选：附加 JSON（未来扩展位；可忽略）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          result: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => ({ type: 'text', text: value?.ok ? `执行结果:\n${value.result ?? ''}` : `执行失败: ${value?.error ?? '?'}` }),
    },
    async execute(args, exec) {
      const sid = sessionIdOf(exec)
      const code = typeof args?.code === 'string' ? args.code.trim() : ''
      if (code === '') return { ok: false, error: 'code 不能为空（例如 return await eda.dmt_Project.getCurrentProjectInfo();）' }
      await backend.refresh() // live facts before gating
      const st = statusOf(backend)
      if (!st.connected) {
        pushActivity({ sid, tool: 'eda_exec', action: '执行官方代码', code: code.slice(0, 120), ok: false, error: '官方桥未连接（门控拦截）' })
        return { ok: false, error: '官方桥未连接：请先 eda_backend_connect（并确认网页版扩展 Run API Gateway 已装且开启「外部交互」）。' }
      }
      const id = pushPendingActivity({ sid, tool: 'eda_exec', action: describeEdaAction(code), code })
      const t0 = Date.now()
      const before = await captureDocumentIds(backend) // best-effort (for 撤回)
      const r = await backend.execute(code)
      const after = await captureDocumentIds(backend)
      updateActivity(id, {
        status: r.ok ? 'done' : 'error',
        ok: r.ok,
        action: describeEdaAction(code),
        result: r.ok ? r.result : '',
        error: r.ok ? '' : r.error,
        durationMs: Date.now() - t0,
        revoke: diffIds(before, after) ?? undefined,
      })
      return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error }
    },
  })
}

/** 读取当前原理图页的尺寸 + 已有图元分布（桥端映射；getAll 间歇失败→重试）。 */
async function readSchLayout(backend) {
  const CODE = `return await (async () => {
    const proj = await eda.dmt_Project.getCurrentProjectInfo();
    const page = proj?.data?.[0]?.schematic?.page?.[0];
    let comps = null; let wires = null;
    for (let i = 0; i < 3 && (comps == null || wires == null); i++) {
      try { comps = await eda.sch_PrimitiveComponent.getAll(); } catch (e) { comps = null; }
      try { wires = await eda.sch_PrimitiveWire.getAll(); } catch (e) { wires = null; }
      if (comps == null || wires == null) await new Promise(r => setTimeout(r, 700));
    }
    const used = [];
    for (const c of (comps || [])) { try { used.push({ x: c.getState_X(), y: c.getState_Y() }); } catch (e) {} }
    for (const w of (wires || [])) { try { const l = w.getState_Line(); for (let i = 0; i + 1 < l.length; i += 2) used.push({ x: l[i], y: l[i + 1] }); } catch (e) {} }
    return { name: page?.name ?? '', width: Number(page?.titleBlockData?.Width?.value ?? 1170), height: Number(page?.titleBlockData?.Height?.value ?? 825), used };
  })();`
  const r = await backend.execute(CODE, 30000)
  if (!r.ok) return { ok: false, error: r.error }
  try { return { ok: true, ...JSON.parse(r.result) } } catch { return { ok: false, error: 'layout read failed' } }
}

/** 框内定位：读页面尺寸+已有图元 → 返回互不冲突的框内网格空位（10mil）。 */
function edaPickSpotTool(backend) {
  return defineTool({
    name: 'eda_pick_spot',
    description: 'Pick in-frame empty grid spots on the CURRENT schematic page (units 10mil; A4 ≈ 1170 x 825). ' +
      'Reads the page size + existing primitives via the OFFICIAL API and returns collision-free points (frame margin 80, grid 100, min gap 150). ' +
      'USE BEFORE placing any component: get spots, then sch_PrimitiveComponent.create(dev, spot.x, spot.y) — never place outside the frame. ' +
      'Triggers: 在哪里放, where to place, 框内定位, pick a spot.',
    parameters: {
      count: { type: 'integer', description: '需要的空位数量（默认 1）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          page: { type: 'string' },
          size: { type: 'string' },
          usedCount: { type: 'integer' },
          spots: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { type: 'integer', required: true },
                y: { type: 'integer', required: true },
                inside: { type: 'boolean' },
              },
            },
          },
          note: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        if (value?.ok !== true) return { type: 'text', text: `框内定位失败: ${value?.error ?? '?'}` }
        const lines = [
          `页面: ${value.page ?? '?'}（${value.size ?? '?'}）· 已有图元采样 ${value.usedCount ?? 0}`,
        ]
        for (const s of value.spots ?? []) lines.push(`  空位: (${s.x}, ${s.y})${s.inside ? '' : ' ⚠框外'}`)
        if (value.note) lines.push(`提示: ${value.note}`)
        return { type: 'text', text: lines.join('\n') }
      },
    },
    async execute(args) {
      const count = Math.max(1, Math.min(50, Number(args?.count) || 1))
      const layout = await readSchLayout(backend)
      if (!layout.ok) return { ok: false, error: layout.error, page: '', size: '', usedCount: 0, spots: [], note: '', }
      const spots = pickSpots({ pageWidth: layout.width, pageHeight: layout.height, used: layout.used, count })
      return {
        ok: spots.length > 0,
        page: layout.name,
        size: `${layout.width} x ${layout.height} (10mil)`,
        usedCount: layout.used.length,
        spots,
        note: spots.length < count ? `仅找到 ${spots.length} 个空位（页面空间不足，建议换一页或改用更小间距）` : `框内空位推荐（边距 80 / 网格 100 / 与已有图元间距 ≥150）`,
        error: '',
      }
    },
  })
}

/** 官方 API 能力清单：agent 规划时主动查 -> 用 eda_exec 落地。 */
function edaCapabilitiesTool() {
  return defineTool({
    name: 'eda_capabilities',
    description: 'List what the OFFICIAL eda.* API can do (structured capability catalogue: domains, methods, usage notes, known pitfalls, verified snippets). ' +
      'Call this when planning a board task and unsure which API exists or how to call it — then use eda_exec with the suggested snippets. ' +
      'Triggers: 有什么API, what can I do on the board, 能力清单, how to place a part.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'integer' },
          capabilities: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                domain: { type: 'string', required: true },
                note: { type: 'string' },
                methods: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string', required: true },
                      desc: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const sections = (value?.capabilities ?? []).map((c) =>
          `## ${c.domain}${c.note ? `（${c.note}）` : ''}\n` + (c.methods ?? []).map((m) => `- ${m.name} — ${m.desc}`).join('\n'),
        )
        return [{ type: 'text', text: sections.join('\n\n') || '(no capabilities)' }]
      },
    },
    async execute() {
      return { count: CAPABILITIES.length, capabilities: CAPABILITIES }
    },
  })
}

/** 紧急保存：把 agent 在画板上做的内容抓到本地（断连也能保留最后步骤）。 */function edaSnapshotTool(handle, backend) {
  return defineTool({
    name: 'eda_snapshot',
    description: 'Emergency-save the current work to ~/.dsh/eda/snapshots/: board state via the OFFICIAL API (native .epro2 + universal SVG preview + netlist/BOM JSON) plus the agent action log. ' +
      'Use when the user wants to 保留最后的工程 / 紧急保存 / 防断连丢档, or when the cloud sync may have failed. ' +
      'Triggers: 紧急保存, save my work locally, 把画板存本地.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          dir: { type: 'string' },
          files: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', required: true }, size: { type: 'integer' } } } },
          errors: { type: 'array', items: { type: 'string' } },
          connected: { type: 'boolean' },
          docFile: { type: 'string' },
          preview: { type: 'string' },
        },
      },
      render: (_args, value) => {
        if (value?.ok !== true) return { type: 'text', text: `紧急保存失败: ${value?.error ?? '?'}` }
        const lines = [
          `✅ 已紧急保存 → ${value.dir ?? ''}`,
          `文件: ${(value?.files ?? []).map((f) => f.name).join(', ') || '无'}`,
          value?.docFile ? `专业版恢复: ${value.docFile}` : '',
          value?.preview ? `通用预览: ${value.preview}` : '',
        ].filter((s) => s !== '')
        if ((value?.errors ?? []).length > 0) lines.push(`降级项: ${value.errors.join('; ')}`)
        return { type: 'text', text: lines.join('\n') }
      },
    },
    async execute(_args, exec) {
      const sid = sessionIdOf(exec)
      const id = pushPendingActivity({ sid, tool: 'eda_snapshot', action: '紧急保存（进行中）' })
      await handle.backend.refresh()
      const t0 = Date.now()
      try {
        const out = await handle.snapshot()
        updateActivity(id, {
          status: out.ok ? 'done' : 'error',
          ok: out.ok === true,
          action: out.connected ? '紧急保存（画板现场+日志）' : '紧急保存（仅动作日志）',
          result: out.dir,
          error: out.errors?.length > 0 ? `${out.errors.length} 项降级：${out.errors.slice(0, 3).join('; ')}` : '',
          durationMs: Date.now() - t0,
        })
        return out
      } catch (error) {
        updateActivity(id, { status: 'error', ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - t0 })
        return { ok: false, error: error instanceof Error ? error.message : String(error), files: [], errors: [] }
      }
    },
  })
}

/** -------------------------------------------------------------- apply */

export function apply(ctx, config) {
  const resolve = () => ({
    enabled: config?.enabled ?? true,
    announceToAgent: config?.announceToAgent ?? true,
  })

  // Record-style timeline: persisted to disk (panel is never empty; history
  // survives restarts). `activityFile` is injectable for tests.
  activityLog = new ActivityLog({ file: config?.activityFile }).loadSync()

  const backend = new EdaBackend({
    bridgeDir: isBridgeInstalled() ? bridgeDir() : '',
    spawnBridge: isBridgeInstalled(),
  })
  const autoStartBridge = config?.autoStartBridge ?? true

  // Observable handle for diagnostics and self-checks.
  const edaHandle = {
    status: () => statusOf(backend),
    generate: generateSchematicJson,
    snapshot: (opts = {}) => createSnapshot({
      execute: (code, timeoutMs) => backend.execute(code, timeoutMs),
      activities: () => activityLog?.entries.slice().reverse() ?? [],
      connected: backend.status().connected,
      ...opts,
    }),
    activity: (opts) => activityFeed(opts),
    clearActivity: async () => { await activityLog?.clear(); return { ok: true } },
    revokeActivity: (id) => revokeActivityEntry(backend, id),
    backend,
    templates: () => TEMPLATE_CATALOG,
    bridgeInstall: installOfficialBridge, // injectable for tests (see test/generate.test.mjs)
  }
  if (typeof ctx.provide === 'function') ctx.provide('eda', edaHandle)
  else ctx.eda = edaHandle

  const { routes } = makeRoutes(edaHandle)
  let disposeRoutes
  let disposeTools
  let disposeSection

  const sync = () => {
    const value = resolve()
    if (disposeSection !== undefined) { disposeSection(); disposeSection = undefined }
    if (disposeRoutes !== undefined) { disposeRoutes(); disposeRoutes = undefined }
    if (disposeTools !== undefined) { disposeTools(); disposeTools = undefined }
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-eda',
        order: SECTION_ORDER,
        text: EDA_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(() => {
      const disposers = routes.map((route) => ctx.webServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    }, 'dsh-eda: routes')
    disposeTools = ctx.effect(() => {
      const disposers = [
        edaStatusTool(edaHandle),
        edaTemplateListTool(),
        edaTranslateRequestTool(),
        edaGenerateSchematicJsonTool(),
        edaBridgeInstallTool(backend),
        edaBackendConnectTool(edaHandle, backend),
        edaExecTool(backend),
        edaPickSpotTool(backend),
        edaCapabilitiesTool(),
        edaSnapshotTool(edaHandle, backend),
        bridgeTool(edaHandle, backend, {
          name: 'eda_sch_drc',
          description: 'Run the schematic DRC via the OFFICIAL API (eda.sch_Drc.check) on the current document — returns detailed errors. ' +
            'Requires the official bridge connected. Triggers: 跑原理图 DRC, check design rules, 检查电路错误.',
          bridgeToolName: 'sch.drc',
          renderSummary: (r) => `DRC: ${typeof r === 'string' ? r : JSON.stringify(r)}`,
        }),
        bridgeTool(edaHandle, backend, {
          name: 'eda_get_netlist',
          description: 'Export the current schematic netlist via the OFFICIAL API (SCH_ManufactureData.getNetlistFile) to verify connectivity. ' +
            'Requires the official bridge connected. Triggers: 导网表, get netlist, 核对网络.',
          bridgeToolName: 'sch.netlist',
          renderSummary: (r) => `网表: ${typeof r === 'string' ? r : JSON.stringify(r)}`,
        }),
        bridgeTool(edaHandle, backend, {
          name: 'eda_get_bom',
          description: 'Export the current schematic BOM via the OFFICIAL API (SCH_ManufactureData.getBomFile) with refdes/packages. ' +
            'Requires the official bridge connected. Triggers: 导 BOM, get bom, 导出物料清单.',
          bridgeToolName: 'sch.bom',
          renderSummary: (r) => {
            let parsed = r
            if (typeof r === 'string') { try { parsed = JSON.parse(r) } catch { /* raw */ } }
            if (parsed != null && typeof parsed === 'object' && typeof parsed.b64 === 'string') {
              return `BOM: ${parsed.name ?? 'Export_BOM.xlsx'}（${((parsed.size ?? 0) / 1024).toFixed(1)}KB，二进制 xlsx）`
            }
            return `BOM: ${typeof r === 'string' ? r.slice(0, 400) : ''}`
          },
        }),
      ].map((tool) => ctx.tools.register(tool))
      return () => { for (const dispose of disposers) dispose() }
    }, 'dsh-eda: tools')
  }

  sync()

  // FULLY-SELF-CONTAINED lifecycle: if the official bridge is installed, the
  // plugin starts it and connects by itself — no external babysitting.
  if (autoStartBridge && resolve().enabled && isBridgeInstalled()) {
    void backend.start().catch(() => { /* status() surfaces the error */ })
  }

  ctx.effect(() => () => {
    backend.dispose()
  }, 'dsh-eda: backend')
}
