# dsh-lichuang-eda

面向 **0 基础开发者** 的 DeepSeek Harness(DSH) 插件：用自然语言，在 **嘉立创 EDA（专业版·网页版为主）** 里自动生成原理图 / PCB 草图，并给出导入与打样引导。

> 设计主张：**不用"截图找坐标"的 computer-use，而用嘉立创官方 API + WebSocket 桥接**，直接驱动用户正在浏览器里打开的在线专业版画板——确定性高、所见即所得。

## 项目定位（最终形态）

本插件 = **平台层**，**生成电路图 = 在对话里进行（skill 式直觉）**：

- **插件 = 平台层**：负责官方桥的 **一键安装 / 启动 / 连接 / 状态**，并在连接后提供执行**官方 `eda.*` API** 的双手（`eda_exec` + 校验工具）+ **离线兜底**（`eda_generate_schematic_json`）。
- **生成电路图 = 在对话里直接进行**：用户直接对 AI 说"嘉立创EDA，启动！帮我画一个…"，agent 用 `eda_exec` 逐步执行官方 `eda.*` API 在用户的**云端画板**实时画（放元件→连线→网络标签→DRC/网表/BOM）。官方文档/样例已随桥 vendored 到 `~/.dsh/eda/bridge/`（`docs/`、`user-guide/`、`guide/`、`format/` 目录），agent 先 `read` 再调用。
- **离线生成 = 兜底**：仅无法连接画板时使用（本地产出可导入嘉立创 EDA 标准版的 JSON，写 `~/.dsh/eda/output/`）。

> 仅使用**官方栈**：官方桥 `easyeda/easyeda-api-skill` + 官方扩展 **Run API Gateway** + 官方 API（prodocs.easyeda.com）。**无任何第三方后端**（easyeda-agent / jlcmcp / easyeda-mcp-pro 已弃用，详见 `docs/eda-backend-research.md` §0.6）。

## 为什么做这个

- 0 基础用户不会画电路图，会说中文需求，希望**有人替他把图画出来**、还能拿去嘉立创打样。
- 嘉立创 EDA 专业版提供官方 API，官方 `easyeda-api-skill` 把「官方桥 + 官方 eda.* API」封装成 AI harness 可用的「画板之手」。
- 本项目把这些**复用**起来，包装成一个 DSH 插件 + 中文引导，做「自然语言 → 电路图」的桥。

## 目录结构

```
F:\dsh-lichuang
├─ README.md                     ← 本文件（项目总览）
├─ package.json                  ← 根级测试门禁（test:all / check / gen）
├─ plugin/                       ← DSH 插件本体（服务端 + 浏览器端 GUI 面板）
│   ├─ package.json              ← dsh.bundle.patch / dsh.client / exports
│   ├─ cordis.patch.yml          ← 热插拔挂载（插入到 DSH web profile roster）
│   ├─ lib/
│   │   ├─ index.js              ← 服务端：apply() 注册 10 工具/5 路由/系统提示
│   │   ├─ backend.js            ← 官方桥适配层（spawn bridge-server.mjs + 端口发现 + /execute）
│   │   └─ client.js             ← 浏览器端：工作台 UI（Hero/向导/模板墙/进度流）
│   ├─ installer.js              ← 一键安装官方桥（离线 vendoring ws + npm 兜底）
│   ├─ selfcheck.mjs             ← 自检脚本（stub ctx）
│   ├─ fixtures/mock-bridge.mjs  ← mock 桥（backend 单测用）
│   └─ test/                     ← status/generate/backend 三组单测
├─ src/
│   ├─ json-gen.js               ← 嘉立创 EDA 标准版 JSON 生成器（18 导出）
│   ├─ validate.js               ← design 级校验（引脚/网表/连通性）
│   ├─ validate.mjs / validate2.mjs ← v6 样本逐字段校验（62 项）/ 工程包装+连通（13 项）
│   ├─ nl-to-design.js           ← 自然语言→设计（模板 + 关键词规则）
│   ├─ json-gen.test.js          ← 生成器 14 例单测
│   └─ output/                   ← demo.json / demo-project.json / demo-netlist.json / preview.svg
└─ docs/
    ├─ plugin-spec.md            ← 从 dsh-logcat 范本提炼的 DSH 插件 API 规范
    ├─ eda-backend-research.md   ← EDA 后端选型/连接机制/DRC·网表·BOM 校验能力调研
    ├─ json-format.md            ← EasyEDA 标准版 JSON 格式说明 + 校验体系
    ├─ eda-onboarding-guide.md   ← 0 基础用户接入官方 API 的傻瓜式引导
    └─ ref/                      ← 参考存档（官方格式文档/真实 v6 样本/easyeda-converter 源码等）
```

## 已注册的 agent 工具（10 个）

| 工具 | 用途 | 可用性 |
|---|---|---|
| `eda_status` | 插件/官方桥状态（装没装 / 端口 / 是否就绪） | ✅ |
| `eda_template_list` | 模板卡目录（含 supported 标记，如实标注） | ✅ |
| `eda_translate_request` | 中文需求 → 结构化设计草稿（只翻译不生成） | ✅ |
| `eda_generate_schematic_json` | **离线兜底**：需求/模板 → 可导入标准版原理图 JSON + 结构/连通性校验，写 `~/.dsh/eda/output/` | ✅ |
| `eda_bridge_install` | **一键安装官方桥**（下载官方 easyeda-api-skill → 解压 → 离线 vendoring ws（npm 兜底）→ 验证） | ✅ 纯函数已测；网络安装真机待验 |
| `eda_backend_connect` | 启动/连接官方桥（bridge-server.mjs，端口 49620-49629 + health 探测） | 🧪 mock 已测，真机待验 |
| `eda_exec` | **云端实时生成的双手**：执行任意官方 `eda.*` 代码（需已连接） | 🧪 桥接门控，真机待验 |
| `eda_sch_drc` | 对当前画板跑原理图 DRC（官方 `eda.sch_Drc.check()`） | 🧪 需已连接 |
| `eda_get_netlist` | 导出当前网表校验连通性 | 🧪 需已连接 |
| `eda_get_bom` | 导出 BOM（位号/封装） | 🧪 需已连接 |

**生命周期**：插件加载时若检测到官方桥已安装，**自动启动并自动连接**（无需人工）；面板实时显示 装没装 / 端口 / 是否就绪。

**限制（诚实说明）**：v0 离线生成器仅支持 **电阻 / LED** 两种符号；云端实时生成能力以官方 `eda.*` API 为准。

## 如何运行 / 开发

> 插件要真正被 DSH Web GUI 加载，需按参考插件 `@windypro-rourou/dsh-logcat` 的方式安装到 DSH web profile（放 profile node_modules + 用 `cordis.patch.yml` 插入 roster）。具体请见 `docs/plugin-spec.md` 与 `plugin/README.md`。

## 当前进度

- [x] 探明 DSH 插件规范（参考 `dsh-logcat`：`defineTool` / `ctx.tools` / `ctx.systemPrompt` / `ctx.webServer` / `ctx.provide`）
- [x] 0 基础用户接入引导（`docs/eda-onboarding-guide.md`，含连接三步 + 对话式生成说明 + 持久性说明 + FAQ）
- [x] EDA 后端选型与连接机制（`docs/eda-backend-research.md` §0.6：**只用官方栈**；插件=平台层、生成=对话 skill）
- [x] EasyEDA 标准版 JSON 生成器（`src/json-gen.js`，18 个导出；结构/网表/连通性三层校验）
- [x] 自然语言→结构设计翻译层（`src/nl-to-design.js` 模板 + 关键词规则；`src/validate.js` design 级校验）
- [x] DSH 插件：**10 个 agent 工具**（含 `eda_exec` 云端实时双手）+ **5 条路由** + 工作台 UI + 官方桥适配层 + 自检 + 插件测试
- [x] 前端 UI（`plugin/lib/client.js`：渐变 Hero + 连接向导 + 模板墙 + 描述输入 + 实时进度流，真调 `/api/dsh-eda/*`）
- [x] 根级测试门禁（根 `package.json`：`npm run test:all`）

**测试（全部通过）**：插件 27/27、生成器 14/14、自检 OK、v6 样本 62/62 + 13/13。

- [ ] **待真机验证项**：① GUI 挂载预览；② 标准版 JSON 在真实编辑器导入（无报错）；③ 云端实时端到端（官方桥连接后 `edaConnected:true`，见 `plugin/README.md`「验证清单」）。

## 测试门禁

```bash
npm run test:all        # json-gen 测试 + 插件自检 + 插件测试
npm run check           # 语法检查（index/client/backend）
npm run gen             # 重新生成 src/output/demo*.json
node src/validate.mjs   # v6 样本逐字段校验（62 项）
node src/validate2.mjs  # 工程包装 + 连通性校验（13 项）
```

> 沙箱受限时：`npm run test:json` / `npm run test:plugin` 已内置 `--experimental-test-isolation=none`。
> 本机 `npm.ps1` 被 PowerShell ExecutionPolicy 禁用时，用 `npm.cmd`（如 `C:\Program Files\nodejs\npm.cmd run test:all`）。
