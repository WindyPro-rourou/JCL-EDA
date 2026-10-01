# @windypro-rourou/dsh-eda — 插件说明

本仓库根即插件包：`git clone https://github.com/WindyPro-rourou/JCL-EDA.git` 开箱即用（详见根 `README.md`「安装」）。

## 如何加载到 DSH Web GUI / 0.2 桌面端

```bash
# 1) 安装到 profile（全部 GitHub 源：clone 后目录名 = 包名）
#    0.1.x web profile:  ~/.dsh/profiles/web
#    0.2 桌面端 profile:  <DSH home>/profiles/desktop（本机 F:\dsh-admited\data\dsh-home\profiles\desktop）
cd <profile>
git clone https://github.com/WindyPro-rourou/JCL-EDA.git         node_modules/@windypro-rourou/dsh-eda
git clone https://github.com/WindyPro-rourou/dsh-logcat.git      node_modules/@windypro-rourou/dsh-logcat
git clone https://github.com/WindyPro-rourou/dsh-code-studio.git node_modules/@windypro-rourou/dsh-code-studio

# 2) 0.1.x：在 cordis.patch.yml 追加 insert 行
#   - insert:
#       - id: eda
#         name: '@windypro-rourou/dsh-eda'

#    0.2 桌面端：把包装进 profile 依赖与 bundles（插件管理器写入同一处）
#      package.json → dependencies: { "@windypro-rourou/dsh-eda": "0.1.4" }
#      package.json → dsh.profile.bundles: [ ..., "@windypro-rourou/dsh-eda" ]
#      然后 pnpm install（profile 目录）

# 3) 重启 GUI → 会话头部出现「嘉立创 EDA」pill，点开即面板
```

### 0.2 界面契约（本插件遵循）

| 项 | 做法 |
|---|---|
| 面板容器 | `slots.register({ name: 'shell.overlay', id: 'eda', order: 90 })` → `position:absolute; z-index:30`（**不再 fixed 9999 遮挡**） |
| 入口 | `slots.register({ name: 'conversation.session.header.utilities', id: 'eda-toggle' })`（0.2 左侧栏为槽位托管）；0.1.x 保留 `[data-pane="sidebar"]` DOM 入口 |
| 主题 | 复用宿主组件库 `@deepseek-ai/dsh-client-ui-primitives`（缺失降级自绘）+ `--dsw-alias-*` 令牌 |
| 尺寸 | 左边缘拖拽调宽 120–760px，`localStorage` 记忆 |

## 测试 / 自检（当前全绿）

```bash
npm run test:all        # selfcheck + 插件 52 例 + 生成器 14 例
npm run check           # 语法检查（lib/index|client|backend）
node selfcheck.mjs      # stub ctx 四表面自检（exit 0 = PASS）
```

覆盖：`eda_status` 严格 schema/render、路由 200/405（status/activity/clear/revoke/templates/bridge/install/generate/snapshot）、`provide`/section；
官方桥客户端（端口发现/health/`/execute`/sch.drc 等动作）；离线生成端到端；installer（官方仓库地址/`~/.dsh/eda/bridge` 路径/幂等）；
ActivityLog（持久化/恢复/clear/cap）、布局选点（框内/网格/间距/避开）、撤回 diff、快照管线（完整/降级/二进制 BOM）、客户端 bundle 深度渲染。

## 验证清单（当前实测状态）

- [x] 服务端/客户端全部单测（52 pass，0 fail）+ 自检 OK + 语法 OK
- [x] **云端实时全流程真机验证**（esp32_multitool）：14 大类放置（原理图+PCB）、引脚级连线、网络标志、DRC verbose、网表（File.text）/BOM（base64 xlsx）、PCB 元件/过孔/焊盘级走线、PCB DRC 详情、现场截图、紧急保存（0 降级）
- [x] 面板记录式时间线（持久化/撤回/清空）+ 能力清单 + 框内定位——服务端就绪（GUI 重启后生效）
- [x] 安装链路：`npm i github:WindyPro-rourou/JCL-EDA` + patch 一行 → 重启（本机 profile 已切换为 GitHub 源）
- [ ] 标准版 JSON 在**真实嘉立创 EDA 标准版**里导入（无报错）——产物与 v6 样本逐键同构，未在标准版编辑器实测
- [ ] npm registry 包 `@windypro-rourou/dsh-eda` 的 **scope 公开可见性**（npm 网页认领 scope 后）

## 不确定 / 未验证（诚实标注）

1. **PCB 电气网络级连网**：直放元件焊盘无网络；`pcb_Document.importChanges`/`pcb_Net.setNetlist`/`getNetlist('EasyEDA')` 实测不可靠——画布级完整、电气级受限（详见 `docs/eda-conversation-skill.md` 附五缺陷速查表）。
2. **PCB 板框**：官方 API 无绘制入口（layer=11 四组参数实测失败）——板框人工/导入获得。
3. **标准版导入验证**：见上（未在真实标准版编辑器实测）。
4. **v0 离线生成器符号**：仅支持 **电阻 / LED**；模板卡里标 ⏳ 的暂不支持，不会编造。
