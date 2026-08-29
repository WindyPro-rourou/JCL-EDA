# dsh-lichuang-eda（嘉立创 EDA 助手）

面向 0 基础开发者，在 DSH Web GUI 里自动生成**嘉立创 EDA（专业版/标准版）原理图 / PCB 草图**的插件。

> **定位 = 平台层**：本插件提供官方桥的 **一键安装 / 启动 / 连接 / 状态**、执行**官方 `eda.*` API** 的双手（`eda_exec` + 校验工具）、以及**离线兜底**（`eda_generate_schematic_json`）。
> **生成电路图 = 在对话里进行（skill 式直觉）**：用户说"嘉立创EDA，启动！帮我画一个…"→ agent 用 `eda_exec` 逐步执行官方 `eda.*` API 在用户的**云端画板**实时画。官方文档/样例已随桥 vendored 到 `~/.dsh/eda/bridge/`（`docs/`、`user-guide/`、`guide/`、`format/` 目录），agent 先 `read` 再调用。
> 仅使用**官方栈**：官方桥 `easyeda/easyeda-api-skill` + 官方扩展 **Run API Gateway** + 官方 API（prodocs.easyeda.com）。**无任何第三方后端**。

## 目录结构

```
plugin/
├── package.json          # 包清单：dsh.bundle.patch / dsh.client / exports（. 和 ./client）
├── cordis.patch.yml      # bundle patch：向 web profile 名册插入插件行（id: eda）
├── lib/
│   ├── index.js          # 宿主端：apply() 注册 10 个 agent 工具 + 5 条路由 + 系统提示
│   ├── backend.js        # 官方桥适配层：spawn bridge-server.mjs + 端口发现(49620-49629) + /execute
│   └── client.js         # 浏览器端（React，无构建步骤）：侧边栏入口 + 工作台面板
├── installer.js          # 一键安装官方桥：下载官方源码包 → 解压 → 离线 vendoring ws（npm 兜底）→ 验证
├── selfcheck.mjs         # 自检脚本：stub ctx 挂载插件，断言 DSH 四表面（见「测试 / 自检」）
├── fixtures/
│   └── mock-bridge.mjs   # mock 官方桥（HTTP/WS），供 backend 单测
├── test/
│   ├── status.test.mjs   # 状态工具/路由
│   ├── generate.test.mjs # 离线生成端到端 + 桥接门控
│   └── backend.test.mjs  # EdaBackend 官方桥客户端 + installer
└── README.md
```

> 依赖仓库根的 `src/`（生成器/校验/翻译层）与 `docs/`（调研/引导文档）。**独立打包发布时需把 `src/` 一并纳入包**（见「不确定/未验证」#6）。

## 已注册的 agent 工具（13 个）

| 工具 | 用途 | 可用性 |
|---|---|---|
| `eda_status` | 插件/官方桥状态（装没装 / 端口 / 是否就绪） | ✅ |
| `eda_template_list` | 模板卡目录（含 supported 标记，如实标注） | ✅ |
| `eda_translate_request` | 中文需求 → 结构化设计草稿（只翻译不生成） | ✅ |
| `eda_generate_schematic_json` | **离线兜底**：需求/模板 → 可导入嘉立创 EDA 标准版的原理图 JSON + 结构/连通性校验，产物写入 `~/.dsh/eda/output/` | ✅ |
| `eda_bridge_install` | **一键安装官方桥**（下载官方 easyeda-api-skill → 解压 → 离线 vendoring ws（npm 兜底）→ 验证 bridge-server.mjs） | ✅ 纯函数已测；网络安装真机待验 |
| `eda_backend_connect` | 启动/连接官方桥（bridge-server.mjs，端口 49620-49629 + health 探测） | 🧪 mock 已测，真机待验 |
| `eda_exec` | **云端实时生成的双手**：执行任意官方 `eda.*` 代码（需已连接）；自动记录每步新建的图元（可撤回） | 🧪 桥接门控，真机待验 |
| `eda_pick_spot` | **框内定位**：读页面尺寸(A4≈1170×825,10mil)+已有图元 → 返回互不冲突的框内网格空位（边距80/网格100/间距150）；放元件前必调 | ✅ 算法 5 例单测；桥读 mock/真机待验 |
| `eda_capabilities` | **能力清单**：官方 eda.* API 结构化能力目录（域/方法/用法/坑/实测片段）——agent 规划时主动查询后调用 | ✅ 内置数据，注册已测 |
| `eda_snapshot` | **紧急保存**：画板现场（`.epro2` 专业版完整恢复 + 预览 SVG + 网表/BOM）+ agent 动作日志 → `~/.dsh/eda/snapshots/`；每步独立降级，断连也能留档步骤 | 🧪 mock 已测（11 例）+ 真机 0 降级 |
| `eda_sch_drc` | 对当前画板跑原理图 DRC（官方 `eda.sch_Drc.check(true,false,true)`——**verbose 重载**） | 🧪 需已连接 |
| `eda_get_netlist` | 导出当前网表（**File.text() 修正**：直接返回 File 会序列化 `{}`） | 🧪 需已连接 |
| `eda_get_bom` | 导出 BOM（**二进制 xlsx 走 base64**，返回 名称/大小 摘要） | 🧪 需已连接 |

**生命周期**：插件加载时若检测到官方桥已安装，**自动启动并自动连接**（无需人工）；面板实时显示 装没装 / 端口 / 是否就绪。

**面板 = 平台仪表盘/监看器**（生成发生在对话里，agent 通过 `eda_exec` 驱动官方 `eda.*` API）：
- 顶部紧凑连接卡 + 可折叠连接教程（默认收起）；已连接时显示「💬 去对话里说：嘉立创EDA，启动！」CTA（点击复制）。
- 主体 **「Agent 正在使用官方 API」记录式时间线**（参考 DSH 会话轨迹，3s 轮询 `GET /activity`）：
  - **持久化**：每一步（序号/时间/动作/耗时/结果/会话）落盘 `~/.dsh/eda/activity.jsonl`——重启不空、历史可回溯；
  - **撤回**：每个 `eda_exec` 步骤自动记录新建/删除的图元 id（前后快照 diff），面板「撤回」按钮可一键删除该步新建图元（删除的不可恢复，如实提示）；
  - **清空记录**：卡片头部一键清空（内存+磁盘）；
  - 点击条目展开完整代码/结果/撤回数据；pending 态「执行中…」；长任务/短任务均实时滚入；
  - 空态展示"你可以让 agent 做…"能力速览（不空白）。
- **按会话隔离**：每条活动记录携带调用方会话 id（工具执行上下文 `exec.agent.id`）；面板默认跟随最新会话，多会话时可下拉切换；无会话的（面板按钮点击）归为「平台操作」。
- 底部 **「紧急保存」**：一键把画板现场抓到本地（`.epro2` 专业版完整恢复 + 预览 SVG 通用可看 + 网表/BOM 数据 + agent 动作日志 → `~/.dsh/eda/snapshots/`）——云端没同步上也能找回最后工程；画板未连接时仍保存动作日志留档。v0 离线生成（标准版 JSON，仅电阻/LED）保留为对话内工具 `eda_generate_schematic_json`，不再占用面板。

**兼容性边界（如实）**：官方 API 仅能导出 epro/epro2（专业版原生）与 PDF/PNG/SVG，**没有「标准版 v6 JSON」导出通道**；因此紧急保存 = 专业版完整恢复 + 通用预览 + 数据文件，标准版可编辑需走离线重建（简单电路）。

**实战经验（真机固化，详见 `docs/eda-conversation-skill.md` 附四~附六）**：框内定位规则（10mil/A4≈1170×825/边距80/网格100/间距150，先 `eda_pick_spot` 再放件）；网表/BOM/DRC 的正确用法（`File.text()` / base64 / `check(true,false,true)`）；已知官方缺陷（`importChanges`、`setNetlist`、`getNetlist('EasyEDA')`、板框无 API、`getAll` 间歇失败）。

**会话说明**：`/activity` 返回 `{ activities, currentSid, sessions }`；`?sid=` 固定到某会话，缺省跟随最新。

## 路由

- `GET /api/dsh-eda/status` — 状态（loopback-only）
- `GET /api/dsh-eda/activity` — 记录式时间线（`?sid=` 可固定会话；loopback-only）
- `POST /api/dsh-eda/activity/clear` — 清空时间线（内存+磁盘）
- `POST /api/dsh-eda/activity/revoke?id=N` — 撤回步骤 N（删除该步新建图元）
- `GET /api/dsh-eda/templates` — 模板目录
- `POST /api/dsh-eda/bridge` — 启动/复用官方桥
- `POST /api/dsh-eda/install` — 一键安装官方桥
- `POST /api/dsh-eda/generate` — 离线生成（`{ description?, template? }` → 结果 JSON）
- `POST /api/dsh-eda/snapshot` — 紧急保存（画板现场 + 动作日志 → `~/.dsh/eda/snapshots/`）

## 测试 / 自检

```bash
# 前置：@deepseek-ai/dsh-tools 可解析（工作区已有 junction，缺失时重建：
#   mklink /J F:\dsh-lichuang\node_modules\@deepseek-ai C:\Users\35081\.dsh\profiles\node_modules\@deepseek-ai ）
# 本机 npm.ps1 被 PowerShell ExecutionPolicy 禁用时，用 npm.cmd：
#   C:\Program Files\nodejs\npm.cmd run test:all

# 自检脚本（stub ctx，断言四表面）
node plugin/selfcheck.mjs

# 插件单元测试（沙箱受限用 --experimental-test-isolation=none；普通终端可直接跑）
node --experimental-test-isolation=none --test "plugin/test/*.test.mjs"

# 生成器单元测试（14 例）
node --test --experimental-test-isolation=none src/json-gen.test.js

# v6 样本校验（62 项结构 + 13 项工程包装/连通）
node src/validate.mjs
node src/validate2.mjs

# 一键全部门禁（根目录）
npm run test:all
```

**当前实测通过**：插件 **27/27**、生成器 **14/14**、自检 **OK**、v6 样本 **62/62 + 13/13**，全部 0 失败。

覆盖：`eda_status` 严格 schema/render、路由 200/405、`provide`/section；官方桥客户端（端口发现/health/`/execute`/`sch.drc` 等动作）；离线生成端到端（中文需求 → JSON 结构+连通性通过、不识别的需求报错、桥接门控报错）；installer（官方仓库/市场地址、`~/.dsh/eda/bridge` 路径、幂等安装标志）；生成器 14 例（结构 lint、sheet 级网表自检、design 级连通性、故意做坏的 3 种电路必须报错、main 产物可复现）。

## 如何在 DSH 里加载

参考 dsh-logcat（`~/.dsh/profiles/web` 即本机 web profile），三选一、**不要同时用**：

```bash
# 方式一：本地路径（bundle 层）
dsh plugin --profile web add link:F:\dsh-lichuang\plugin
# 方式二：源码本地链接（profile node_modules）+ 在 profile 的 cordis.patch.yml 追加：
#   - insert:
#       - id: eda
#         name: '@dsh-lichuang/dsh-eda'
# 方式三：发布 npm 后
dsh plugin --profile web add @dsh-lichuang/dsh-eda
```

装完后**重启 GUI** 生效。

## 验证清单（当前实测状态）

- [x] `node plugin/selfcheck.mjs`（OK）
- [x] `node --test ... plugin/test/*.test.mjs`（27 pass，0 fail）
- [x] `node --test ... src/json-gen.test.js`（14 pass）
- [x] `node src/validate.mjs`（62/62）· `node src/validate2.mjs`（13/13）
- [x] `node --check plugin/lib/{index,client,backend}.js`（语法通过）
- [x] v6 真实导出样本逐字段校验通过（`docs/ref/SCH_ESP32-PICO-D4_smart_watch_2023-09-02.json`）
- [ ] `dsh plugin --profile web add link:...` 实测 + GUI 重启后侧边栏出现「嘉立创 EDA」入口
- [ ] 生成的标准版 JSON 在**真实嘉立创 EDA 标准版**里导入（无报错）
- [ ] **真机（云端实时端到端）**：登录浏览器打开专业版画板 → 装官方扩展 Run API Gateway → `eda_backend_connect` 启动/连接官方桥 → **扩展连桥后 `eda_status.connected` 为 `true`** → `eda_exec` 放元件/连线/网络标签 → `eda_sch_drc`/`eda_get_netlist`/`eda_get_bom`

## 不确定 / 未验证（诚实标注）

1. **云端实时端到端（最重要）**：官方桥（bridge-server.mjs）与官方扩展 Run API Gateway 的**真机联通**未验证。诚实做法：扩展在编辑器连上桥后，`eda_status` 返回 `connected:true` 即为联通信号（本插件据此对外宣称"就绪"）。在此之前，`eda_exec`/`eda_sch_drc`/`eda_get_netlist`/`eda_get_bom` 会在未连接时返回明确门控错误，不会伪造结果。
2. **「能被嘉立创 EDA 标准版无报错导入」**：生成物与真实 v6 导出样本逐键同构、结构/连通性全自动断言通过，但**未在真实编辑器实测导入**（无账号/编辑器）。官方「EasyEDA 源文件对话框粘贴 Apply」是最低成本自检路径。
3. **官方桥的网络安装**：`eda_bridge_install` 的下载/解压/装依赖逻辑已测（`isBridgeInstalled`/路径/幂等/离线 vendoring ws），但**真实下载官方源码包**需联网，本机待真机/网络可用时验证。
4. **`dsh plugin --profile web add link:` 语法 / client bundle 装载 / `inject=["slots"]`**：照抄 logcat，未在本机实测。
5. **v0 离线生成器符号**：仅支持 **电阻 / LED**；模板卡里标 ⏳ 的是暂不支持，不会编造。
6. **打包边界**：`lib/index.js` 以相对路径 `../../src/...` 引入生成器/校验/翻译层（monorepo 布局）。独立发布需将 `src/` 纳入包或改为打包构建。
