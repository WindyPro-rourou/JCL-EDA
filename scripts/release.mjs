/**
 * 发版脚本：bump 版本 → npm publish → git commit + tag + push（GitHub）。
 *
 * 安全与自动化要点（2026-08 实测固化）：
 *   - GH 凭据交给系统凭据管理器（credential.helper=manager），**不内嵌 token**；
 *   - 代理自动探测：git config http.proxy → HTTPS_PROXY 环境变量 →
 *     系统（WinINET) 代理 → 无；
 *   - 发版同时打 `git tag v<version>`（npm 版本 ↔ GitHub 发布对应）。
 * 用法：node scripts/release.mjs --version=0.1.3
 * npm 侧 token：$env:NPM_TOKEN（无则用 ~/.npmrc 现有凭据）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv.find((a) => a.startsWith('--version='))?.slice('--version='.length)
if (!version || !/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(version)) {
  console.error('用法: node scripts/release.mjs --version=0.1.3')
  process.exit(1)
}

/** 自动探测本机代理（git 直连 github.com 常被断；走代理可通）。 */
function detectProxy() {
  const fromGit = execFileSync('git', ['config', '--get', 'http.proxy'], { cwd: ROOT, encoding: 'utf8' }).trim()
  if (fromGit) return fromGit
  const env = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
  if (env) return env
  try {
    const val = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'], { encoding: 'utf8' }).toString()
    const m = /ProxyServer\s+REG_SZ\s+(\S+)/.exec(val)
    return m ? `http://${m[1]}` : null
  } catch { return null }
}
const proxy = detectProxy()
console.log('代理:', proxy ?? '(无，直连)')

const npmCliSource = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts })
const npmRun = (args) => {
  if (npmCliSource) return run(process.execPath, [npmCliSource, ...args])
  return run('cmd.exe', ['/c', 'npm.cmd', ...args])
}

const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const oldVersion = pkg.version
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`版本: ${oldVersion} → ${version}`)

// 1) npm publish（scripts/publish.mjs；token 走 env NPM_TOKEN 或 ~/.npmrc）
npmRun(['node', join(ROOT, 'scripts', 'publish.mjs')])
console.log('✅ npm publish 完成')

// 2) git commit + tag + push（凭据管理器 + 代理）
const gitArgs = proxy ? ['-c', `http.proxy=${proxy}`] : []
const git = (args) => execFileSync('git', [...gitArgs, ...args], { cwd: ROOT, encoding: 'utf8' })
git(['add', 'package.json'])
git(['commit', '-m', `release v${version}`])
git(['tag', `v${version}`])
git(['push', 'origin', 'main', '--tags'])
console.log(`✅ GitHub 推送完成（tag v${version}）`)
console.log('提示：若凭据管理器未授权，请先 git push 一次完成登录，或用 GH_TOKEN 环境变量。')
