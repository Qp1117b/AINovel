#!/usr/bin/env node
/**
 * scripts/setup.js
 *
 * 一键初始化脚本：npm run setup
 *
 * 所有子资源统一放在 <项目根>/resources/ 下：
 *   resources/sillytavern/   ← ST 源码
 *   resources/node/          ← node.exe（由 download-node.js 负责）
 */

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RES_DIR = path.join(ROOT, 'resources');
const ST_DIR = path.join(RES_DIR, 'sillytavern');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const EXT_DIR = path.join(ST_DIR, 'public', 'scripts', 'extensions', 'third-party');
const HELPER_DIR = path.join(EXT_DIR, 'JS-Slash-Runner');
const DOWNLOAD_DIR = path.join(ROOT, 'download');

// ─── 下载地址（与 main.js 保持一致）────────────────────────────
const ST_REPO_ZIP_URLS = [
  'https://ghproxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
  'https://gh-proxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
  'https://ghps.cc/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
  'https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
];

const ST_REPO_GIT = 'https://github.com/SillyTavern/SillyTavern.git';

const HELPER_REPO_ZIP_URLS = [
  'https://ghproxy.com/https://github.com/N0VI028/JS-Slash-Runner/archive/refs/heads/main.zip',
  'https://github.com/N0VI028/JS-Slash-Runner/archive/refs/heads/main.zip',
];

const HELPER_REPO_GIT = 'https://github.com/N0VI028/JS-Slash-Runner.git';

const CDN_DEPS = [
  { url: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js', file: 'marked.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', file: 'jszip.min.js' },
  { url: 'https://unpkg.com/gpt-tokenizer/dist/cl100k_base.js', file: 'gpt-tokenizer.js' },
];

function run(cmd, cwd = ROOT) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function hasGit() {
  try { execSync('git --version', { stdio: 'pipe' }); return true; } catch (_) { return false; }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest + '.tmp');
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlinkSync(dest + '.tmp');
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest + '.tmp');
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); fs.renameSync(dest + '.tmp', dest); resolve(); });
    }).on('error', (e) => { try { fs.unlinkSync(dest + '.tmp'); } catch (_) { } reject(e); });
  });
}

function extractZip(zipPath, destDir) {
  const psScript = path.join(DOWNLOAD_DIR, '_extract.ps1');
  ensureDir(destDir);
  fs.writeFileSync(psScript, `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`);
  execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'pipe' });
  fs.unlinkSync(psScript);
}

// ─── 步骤 1：SillyTavern ──────────────────────────────────────
async function setupSillyTavern() {
  console.log('\n══════════════════════════════════════');
  console.log('  步骤 1：SillyTavern → resources/sillytavern/');
  console.log('══════════════════════════════════════');

  ensureDir(RES_DIR);
  ensureDir(DOWNLOAD_DIR);

  if (fs.existsSync(path.join(ST_DIR, 'server.js'))) {
    console.log('SillyTavern 已存在，跳过');
    return;
  }

  // 优先使用 git（如果可用）
  if (hasGit()) {
    try {
      console.log(`使用 git 克隆: ${ST_REPO_GIT}`);
      run(`git clone --branch release --depth 1 "${ST_REPO_GIT}" "${ST_DIR}"`);
      console.log('安装 ST npm 依赖...');
      run('npm install --omit=dev', ST_DIR);
      console.log('✅ SillyTavern 就绪 (git)');
      return;
    } catch (e) {
      console.log(`⚠️ git 克隆失败: ${e.message}`);
      console.log('尝试使用 zip 下载...');
      try { fs.rmSync(ST_DIR, { recursive: true, force: true }); } catch (_) { }
    }
  }

  // 使用 zip 下载
  const zipPath = path.join(DOWNLOAD_DIR, 'sillytavern.zip');
  const extractDir = path.join(DOWNLOAD_DIR, 'st-extract');

  for (const url of ST_REPO_ZIP_URLS) {
    try {
      console.log(`下载: ${url}`);
      await downloadFile(url, zipPath);
      console.log('解压...');
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      extractZip(zipPath, extractDir);

      const folders = fs.readdirSync(extractDir);
      if (folders.length > 0) {
        fs.renameSync(path.join(extractDir, folders[0]), ST_DIR);
      }

      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      try { fs.unlinkSync(zipPath); } catch (_) { }

      console.log('安装 ST npm 依赖...');
      run('npm install --omit=dev', ST_DIR);
      console.log('✅ SillyTavern 就绪 (zip)');
      return;
    } catch (e) {
      console.log(`⚠️ 下载失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }

  throw new Error('所有 SillyTavern 下载源均失败');
}

// ─── 步骤 2：酒馆助手 ─────────────────────────────────────────
async function setupTavernHelper() {
  console.log('\n══════════════════════════════════════');
  console.log('  步骤 2：酒馆助手 (JS-Slash-Runner)');
  console.log('══════════════════════════════════════');

  ensureDir(EXT_DIR);

  if (fs.existsSync(path.join(HELPER_DIR, 'package.json'))) {
    console.log('酒馆助手已存在，跳过');
    return;
  }

  // 优先使用 git
  if (hasGit()) {
    try {
      console.log(`使用 git 克隆: ${HELPER_REPO_GIT}`);
      run(`git clone --depth 1 "${HELPER_REPO_GIT}" "${HELPER_DIR}"`);
      const helperPkg = path.join(HELPER_DIR, 'package.json');
      if (fs.existsSync(helperPkg)) {
        console.log('安装酒馆助手依赖...');
        run('npm install --omit=dev --legacy-peer-deps', HELPER_DIR);
      }
      console.log('✅ 酒馆助手就绪 (git)');
      return;
    } catch (e) {
      console.log(`⚠️ git 克隆失败: ${e.message}`);
      console.log('尝试使用 zip 下载...');
      try { fs.rmSync(HELPER_DIR, { recursive: true, force: true }); } catch (_) { }
    }
  }

  // 使用 zip 下载
  const zipPath = path.join(DOWNLOAD_DIR, 'tavern-helper.zip');
  const extractDir = path.join(DOWNLOAD_DIR, 'tavern-helper-extract');

  for (const url of HELPER_REPO_ZIP_URLS) {
    try {
      console.log(`下载: ${url}`);
      await downloadFile(url, zipPath);
      console.log('解压...');
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      extractZip(zipPath, extractDir);

      const folders = fs.readdirSync(extractDir);
      if (folders.length > 0) {
        fs.renameSync(path.join(extractDir, folders[0]), HELPER_DIR);
      }

      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      try { fs.unlinkSync(zipPath); } catch (_) { }

      const helperPkg = path.join(HELPER_DIR, 'package.json');
      if (fs.existsSync(helperPkg)) {
        console.log('安装酒馆助手依赖...');
        run('npm install --omit=dev --legacy-peer-deps', HELPER_DIR);
      }
      console.log('✅ 酒馆助手就绪 (zip)');
      return;
    } catch (e) {
      console.log(`⚠️ 下载失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }

  console.log('⚠️ 酒馆助手下载失败，但不影响主程序运行');
}

// ─── 步骤 3：修改 ST 配置 ─────────────────────────────────────
function patchSTConfig() {
  console.log('\n══════════════════════════════════════');
  console.log('  步骤 3：修改 ST 配置');
  console.log('══════════════════════════════════════');

  // 标记酒馆助手为已启用
  const extStateDir = path.join(ST_DIR, 'data', 'default-user', 'extensions');
  ensureDir(extStateDir);
  fs.writeFileSync(path.join(extStateDir, 'JS-Slash-Runner.json'), JSON.stringify({ enabled: true }, null, 2));

  // 创建 default/config.yaml
  const defaultCfgDir = path.join(ST_DIR, 'default');
  ensureDir(defaultCfgDir);
  const defaultCfgPath = path.join(defaultCfgDir, 'config.yaml');
  if (!fs.existsSync(defaultCfgPath)) {
    fs.writeFileSync(defaultCfgPath, `# SillyTavern Default Configuration Template
listen: true
port: 8000
whitelistMode: false
autorun: false
enableExtensions: true
`);
    console.log('✅ 创建 default/config.yaml');
  }

  // 修改 config.yaml
  const cfgPath = path.join(ST_DIR, 'config.yaml');
  if (fs.existsSync(cfgPath)) {
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    cfg = cfg.replace(/whitelistMode:\s*true/, 'whitelistMode: false');
    cfg = cfg.replace(/autorun:\s*true/, 'autorun: false');
    fs.writeFileSync(cfgPath, cfg);
    console.log('✅ config.yaml 已调整');
  } else {
    fs.writeFileSync(cfgPath,
      `listen: true\nport: 8000\nwhitelistMode: false\nautorun: false\ndisableCsrf: true\n`);
    console.log('✅ 生成默认 config.yaml');
  }
}

// ─── 步骤 4：下载前端依赖 ─────────────────────────────────────
async function downloadVendorDeps() {
  console.log('\n══════════════════════════════════════');
  console.log('  步骤 4：下载前端依赖 → vendor/');
  console.log('══════════════════════════════════════');
  ensureDir(VENDOR_DIR);
  for (const dep of CDN_DEPS) {
    const dest = path.join(VENDOR_DIR, dep.file);
    if (fs.existsSync(dest)) { console.log(`  跳过（已存在）: ${dep.file}`); continue; }
    process.stdout.write(`  下载 ${dep.file}...`);
    try { await downloadFile(dep.url, dest); console.log(' ✅'); }
    catch (e) { console.log(` ⚠️ 失败(${e.message})，运行时将降级使用 CDN`); }
  }
}

// ─── 主流程 ───────────────────────────────────────────────────
(async () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   自动化小说创作系统 — 环境初始化          ║');
  console.log('╚══════════════════════════════════════════╝');

  try {
    await setupSillyTavern();
    await setupTavernHelper();
    patchSTConfig();
    await downloadVendorDeps();

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   初始化完成！                            ║');
    console.log('║                                           ║');
    console.log('║   目录结构：                              ║');
    console.log('║   resources/                              ║');
    console.log('║     sillytavern/  ← ST 源码 ✅            ║');
    console.log('║                                           ║');
    console.log('║   下一步：                                ║');
    console.log('║   1. 放入 auto.js                         ║');
    console.log('║   2. npm install                          ║');
    console.log('║   3. npm start（开发测试）                ║');
    console.log('║   4. npm run build:win（打包 exe）        ║');
    console.log('╚══════════════════════════════════════════╝\n');
  } catch (err) {
    console.error('\n❌ 初始化失败:', err.message);
    process.exit(1);
  }
})();
