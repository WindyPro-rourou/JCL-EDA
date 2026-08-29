// gen-index.mjs — 扫描 vendored 官方 easyeda-api-skill 文档目录，生成中文导航索引 INDEX.md。
// 使用: node scratch/gen-index.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/dsh-lichuang';
const SKILL = path.join(ROOT, 'skill');
const OUT = path.join(SKILL, 'INDEX.md');

// ---------- 1. 扫描 ----------
function listMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

const topLevel = fs.readdirSync(SKILL, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
  .map((e) => e.name)
  .sort();

const subMaps = {};
for (const sub of ['format', 'guide', 'user-guide']) {
  subMaps[sub] = listMd(path.join(SKILL, sub));
}
// references 目录下的分类
const refSub = {};
for (const sub of ['classes', 'enums', 'types', 'interfaces']) {
  refSub[sub] = listMd(path.join(SKILL, 'references', sub));
}

console.log('=== 探测结果 ===');
console.log('顶层 md:', topLevel.join(', '));
for (const [k, v] of Object.entries(subMaps)) {
  console.log(`${k}/: ${v.length} 个  (${v.join(', ')})`);
}
for (const [k, v] of Object.entries(refSub)) {
  console.log(`references/${k}: ${v.length} 个`);
}

// ---------- 2. 收集 references/classes 文件名（去 .md）并分组 ----------
const classes = refSub.classes.map((f) => f.replace(/\.md$/i, ''));

const groupDefs = [
  ['SCH_*', (n) => n.startsWith('SCH_')],
  ['PCB_*', (n) => n.startsWith('PCB_')],
  ['IPCB_*/ISCH_*', (n) => n.startsWith('IPCB_') || n.startsWith('ISCH_')],
  ['DMT_*', (n) => n.startsWith('DMT_')],
  ['LIB_*', (n) => n.startsWith('LIB_')],
  ['SYS_*', (n) => n.startsWith('SYS_')],
  ['PNL_*', (n) => n.startsWith('PNL_')],
  ['EDA', (n) => n.startsWith('EDA')],
];

const groups = new Map();
for (const [name] of groupDefs) groups.set(name, []);
for (const cls of classes) {
  const hit = groupDefs.find(([, test]) => test(cls));
  if (hit) {
    groups.get(hit[0]).push(cls);
  } else {
    console.warn(`未匹配分组的类: ${cls}`);
  }
}
for (const [name, arr] of groups) arr.sort((a, b) => a.localeCompare(b));

const totalClasses = classes.length;
console.log(`\nclasses 总数: ${totalClasses}`);
let groupCount = 0;
for (const [name, arr] of groups) {
  if (arr.length > 0) groupCount++;
  console.log(`  ${name}: ${arr.length}`);
}
console.log(`有效分组数: ${groupCount}`);

// ---------- 3. 生成 INDEX.md ----------
const lines = [];
lines.push('# 官方 EasyEDA Skill 知识库导航');
lines.push('');
lines.push(
  '本目录为官方 easyeda-api-skill 文档的 vendored 拷贝（含 SKILL.md 总纲、官方 README、format/ 文档格式、guide/ 教程、references/ 参考文档）。' +
  'agent 通过 `eda_skill_read` 查阅：`doc` 参数填本文件内的相对路径，如 `references/classes/SCH_PrimitiveComponent.md`。'
);
lines.push('');
lines.push('## 入口');
lines.push('');
lines.push('| 文件 | 内容 |');
lines.push('|---|---|');
lines.push('| SKILL.md | 官方总纲（环境/坐标系/常见错误/示例） |');
lines.push('| README.official.md / README.zh-Hans.official.md | 官方说明（英文/中文） |');
lines.push('| guide/ | 教程（使用扩展/如何开始/市场/国际化等） |');
lines.push('| user-guide/ | 用户指南 |');
lines.push('| format/ | 官方文档格式（schematic/pcb/project 各字段） |');
lines.push('');
lines.push('## 按任务快速定位');
lines.push('');
lines.push('| 任务 | 推荐文档 |');
lines.push('|---|---|');
lines.push('| 画原理图导线/元件 | references/classes/SCH_PrimitiveWire.md、SCH_PrimitiveComponent.md、SCH_Document.md |');
lines.push('| 网络标志/端口 | SCH_PrimitiveComponent.md（createNetFlag/createNetPort） |');
lines.push('| DRC | SCH_Drc.md、PCB_Drc.md |');
lines.push('| 网表/BOM | SCH_ManufactureData.md、SCH_Netlist.md、PCB_ManufactureData.md |');
lines.push('| PCB 元件/过孔/走线 | PCB_PrimitiveComponent.md、PCB_PrimitiveVia.md、PCB_PrimitiveLine.md、PCB_Document.md |');
lines.push('| 工程/文档管理 | DMT_Project.md、DMT_EditorControl.md、DMT_Schematic.md、DMT_Pcb.md |');
lines.push('| 搜索器件 | LIB_Device.md、LIB_LibrariesList.md |');
lines.push('| 画板截图 | DMT_EditorControl.md（getCurrentRenderedAreaImage） |');
lines.push('| 文档导出/本地文件 | SYS_FileManager.md、SYS_FileSystem.md |');
lines.push('');
lines.push(`## references/classes 类索引（${totalClasses} 个）`);
lines.push('');
for (const [name, arr] of groups) {
  if (arr.length === 0) continue;
  lines.push(`### ${name}（${arr.length} 个）`);
  lines.push('');
  for (const cls of arr) {
    lines.push(`- ${cls}`);
  }
  lines.push('');
}
lines.push('## 其它参考');
lines.push('');
lines.push('### references/enums');
lines.push('> ' + refSub.enums.map((f) => f.replace(/\.md$/i, '')).join('、'));
lines.push('');
lines.push('### references/types');
lines.push('> ' + refSub.types.map((f) => f.replace(/\.md$/i, '')).join('、'));
lines.push('');
lines.push('### references/interfaces');
lines.push('> ' + refSub.interfaces.map((f) => f.replace(/\.md$/i, '')).join('、'));
lines.push('');
lines.push('> 查阅方式：`eda_skill_read { "doc": "references/classes/SCH_PrimitiveComponent.md" }`');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`\n已生成: ${OUT}`);
