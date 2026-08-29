/**
 * npm 发布脚本（仓库根 = 插件包根）：
 *   直接对当前目录 npm pack + npm publish（files: lib/ src/ cordis.patch.yml README.md）。
 * 认证：$env:NPM_TOKEN（写入临时 .npmrc 的环境变量引用，不落盘 token）。
 * 用法：node scripts/publish.mjs [--dry] [--pkg-name=@scope/name]
 */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DRY = process.argv.includes('--dry')
const PKG_NAME = process.argv.find((a) => a.startsWith('--pkg-name='))?.slice('--pkg-name='.length) ?? null
if (PKG_NAME) console.log('发布名覆盖:', PKG_NAME)

const npmCli = existsSync('C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js')
  ? 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
  : 'npm'
const run = (args, cwd = ROOT) => {
  if (npmCli.endsWith('.js')) {
    return execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: false })
  }
  return execFileSync('cmd.exe', ['/c', 'npm.cmd', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: false })
}
const parseJsonOut = (text) => JSON.parse(text.slice(Math.min(text.indexOf('['), text.indexOf('{'))))

// root package.json 临时覆盖发布名（不改仓库源文件）
const rootPkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const tmpRc = existsSync(npmCli) ? null : null
const staged = { ...rootPkg }
if (PKG_NAME) staged.name = PKG_NAME
// 发布时 npm 会执行包内 scripts 生命周期（如 publish/prepublishOnly）；暂存副本里没有 scripts/，
// 会触发递归失败。发布产物不需要 scripts，直接剥掉，避免 execute 到不存在的 scripts/publish.mjs。
delete staged.scripts

const work = await mkdtemp(join(tmpdir(), 'eda-pub-'))
try {
  await writeFile(join(work, 'package.json'), JSON.stringify(staged, null, 2) + '\n', 'utf8')
  // 用 work 目录里的 package.json 做为发布上下文（lib/src 在 ROOT → cwd 必须在 ROOT；
  // 简单方案：把 lib/src/patch/readme 复制进 work（小仓库，快））
  const { cp } = await import('node:fs/promises')
  for (const entry of ['lib', 'src', 'skill', 'cordis.patch.yml', 'README.md']) {
    await cp(join(ROOT, entry), join(work, entry), { recursive: true, filter: (p) => !/(^|[\\/])(node_modules|test|fixtures|scripts)([\\/]|$)/.test(p) && !/\.test\.js$/.test(p) && !/\.bundle\.js$/.test(p) })
  }
  const token = process.env.NPM_TOKEN
  if (!DRY && !token) throw new Error('需要 $env:NPM_TOKEN（npm 访问令牌）后再发布')
  if (!DRY) await writeFile(join(work, '.npmrc'), '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n', 'utf8')

  const listing = parseJsonOut(run(['pack', '--dry-run', '--json'], work))
  const files = listing[0].files.map((f) => f.path)
  console.log('包内文件（前 20）：')
  for (const f of files.slice(0, 20)) console.log('  ', f)
  if (!files.includes('src/json-gen.js')) throw new Error('src/ 未进包！中止')
  if (!files.includes('cordis.patch.yml')) throw new Error('cordis.patch.yml 未进包！中止')

  if (DRY) {
    console.log('[dry] 未发布。校验通过。')
  } else {
    const pub = run(['publish', '--access', 'public', '--tag', 'latest'], work)
    console.log('PUBLISHED:', (pub || '').slice(0, 300))
  }
} finally {
  await rm(work, { recursive: true, force: true })
}
