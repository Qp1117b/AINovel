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
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RES_DIR = path.join(ROOT, 'resources');           // 统一资源根目录
const ST_DIR = path.join(RES_DIR, 'sillytavern');      // ← resources/sillytavern
const VENDOR_DIR = path.join(ROOT, 'vendor');
const EXT_DIR = path.join(ST_DIR, 'public', 'scripts', 'extensions', 'third-party');
const HELPER_DIR = path.join(EXT_DIR, 'JS-Slash-Runner');

// const ST_REPO = 'https://github.com/SillyTavern/SillyTavern.git';
const ST_REPO = 'https://gitee.com/boomer001/SillyTavern';
const HELPER_REPO = 'https://github.com/N0VI028/JS-Slash-Runner.git';

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
    const file = fs.createWriteStream(dest + '.tmp');
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlinkSync(dest + '.tmp');
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); fs.renameSync(dest + '.tmp', dest); resolve(); });
    }).on('error', (e) => { try { fs.unlinkSync(dest + '.tmp'); } catch (_) { } reject(e); });
  });
}

// ─── 步骤 1：SillyTavern ──────────────────────────────────────
async function setupSillyTavern() {
  console.log('\n══════════════════════════════════════');
  console.log('  步骤 1：SillyTavern → resources/sillytavern/');
  console.log('══════════════════════════════════════');

  if (!hasGit()) { console.error('❌ 未检测到 git，请先安装 Git'); process.exit(1); }

  ensureDir(RES_DIR);

  if (fs.existsSync(path.join(ST_DIR, '.git'))) {
    console.log('已存在，执行 git pull...');
    run('git pull origin release', ST_DIR);
  } else {
    console.log(`克隆到: ${ST_DIR}`);
    run(`git clone --branch release --depth 1 "${ST_REPO}" "${ST_DIR}"`);
  }

  console.log('安装 ST npm 依赖...');
  run('npm install --omit=dev', ST_DIR);
  console.log('✅ SillyTavern 就绪');
}

// ─── 步骤 2：酒馆助手 ─────────────────────────────────────────
async function setupTavernHelper() {
  console.log('\n══════════════════════════════════════');
  console.log('  步骤 2：酒馆助手 (JS-Slash-Runner)');
  console.log('══════════════════════════════════════');

  ensureDir(EXT_DIR);

  if (fs.existsSync(path.join(HELPER_DIR, '.git'))) {
    console.log('已存在，执行 git pull...');
    run('git pull origin main', HELPER_DIR);
  } else {
    console.log(`克隆到: ${HELPER_DIR}`);
    run(`git clone --depth 1 "${HELPER_REPO}" "${HELPER_DIR}"`);
  }

  const helperPkg = path.join(HELPER_DIR, 'package.json');
  if (fs.existsSync(helperPkg)) {
    console.log('安装酒馆助手依赖...');
    run('npm install --omit=dev --legacy-peer-deps', HELPER_DIR);
  }
  console.log('✅ 酒馆助手就绪');
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

  // 修改 config.yaml
  const cfgPath = path.join(ST_DIR, 'config.yaml');
  if (fs.existsSync(cfgPath)) {
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    cfg = cfg.replace(/whitelistMode:\s*true/, 'whitelistMode: false');
    cfg = cfg.replace(/autorun:\s*true/, 'autorun: false');
    fs.writeFileSync(cfgPath, cfg);
    console.log('✅ config.yaml 已调整（关闭白名单、关闭自动打开浏览器）');
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
    console.log('║   初始化完成！                             ║');
    console.log('║                                           ║');
    console.log('║   目录结构：                              ║');
    console.log('║   resources/                             ║');
    console.log('║     sillytavern/  ← ST 源码 ✅            ║');
    console.log('║     node/         ← 还需要 node.exe      ║');
    console.log('║                                           ║');
    console.log('║   下一步：                                ║');
    console.log('║   1. node scripts/download-node.js       ║');
    console.log('║   2. 将 auto.js 放到项目根目录             ║');
    console.log('║   3. npm install                         ║');
    console.log('║   4. npm start（开发测试）                 ║');
    console.log('║   5. npm run build:win（打包 exe）         ║');
    console.log('╚══════════════════════════════════════════╝\n');
  } catch (err) {
    console.error('\n❌ 初始化失败:', err.message);
    process.exit(1);
  }
})();