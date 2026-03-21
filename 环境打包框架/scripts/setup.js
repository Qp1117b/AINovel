#!/usr/bin/env node
/**
 * scripts/setup.js
 *
 * 一键初始化脚本，执行 `npm run setup` 时运行。
 * 完成以下操作：
 *   1. 克隆 / 更新 SillyTavern（release 分支）到 ./sillytavern/
 *   2. 安装 SillyTavern 的 npm 依赖
 *   3. 克隆 / 更新 JS-Slash-Runner（酒馆助手）到 ST 扩展目录
 *   4. 修改 ST 配置，预先启用酒馆助手扩展
 *   5. 下载三个前端依赖到 ./vendor/（离线备用）
 *   6. 提示下载 Node.js 便携版
 *
 * 依赖：系统已安装 git 和 node/npm
 */

const { execSync, spawn } = require('child_process');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ROOT        = path.resolve(__dirname, '..');
const ST_DIR      = path.join(ROOT, 'sillytavern');
const VENDOR_DIR  = path.join(ROOT, 'vendor');
const EXT_DIR     = path.join(ST_DIR, 'public', 'scripts', 'extensions', 'third-party');
const HELPER_DIR  = path.join(EXT_DIR, 'JS-Slash-Runner');

const ST_REPO     = 'https://github.com/SillyTavern/SillyTavern.git';
const HELPER_REPO = 'https://github.com/N0VI028/JS-Slash-Runner.git';

// 镜像（国内加速）
const ST_REPO_MIRROR     = 'https://gitee.com/mirrors/SillyTavern.git';    // 若 GitHub 慢可切换
const HELPER_REPO_MIRROR = 'https://gitee.com/n0vi028/JS-Slash-Runner.git'; // Gitee 镜像（如有）

const CDN_DEPS = [
  {
    url:  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    file: 'marked.min.js',
  },
  {
    url:  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    file: 'jszip.min.js',
  },
  {
    url:  'https://unpkg.com/gpt-tokenizer/dist/cl100k_base.js',
    file: 'gpt-tokenizer.js',
  },
];

// ─── 工具函数 ──────────────────────────────────────────────────
function run(cmd, cwd = ROOT) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // 跟随重定向
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function hasGit() {
  try { execSync('git --version', { stdio: 'pipe' }); return true; }
  catch (_) { return false; }
}

// ─── 步骤 1：克隆/更新 SillyTavern ────────────────────────────
async function setupSillyTavern() {
  console.log('\n═══════════════════════════════════════');
  console.log('  步骤 1：SillyTavern');
  console.log('═══════════════════════════════════════');

  if (!hasGit()) {
    console.error('❌ 未检测到 git，请先安装 Git: https://git-scm.com/');
    process.exit(1);
  }

  if (fs.existsSync(path.join(ST_DIR, '.git'))) {
    console.log('检测到已有 SillyTavern，执行更新…');
    run('git pull origin release', ST_DIR);
  } else {
    console.log('克隆 SillyTavern release 分支…');
    run(`git clone --branch release --depth 1 "${ST_REPO}" sillytavern`);
  }

  console.log('安装 SillyTavern npm 依赖…');
  run('npm install --omit=dev', ST_DIR);
  console.log('✅ SillyTavern 就绪');
}

// ─── 步骤 2：克隆/更新 JS-Slash-Runner（酒馆助手） ────────────
async function setupTavernHelper() {
  console.log('\n═══════════════════════════════════════');
  console.log('  步骤 2：酒馆助手 (JS-Slash-Runner)');
  console.log('═══════════════════════════════════════');

  ensureDir(EXT_DIR);

  if (fs.existsSync(path.join(HELPER_DIR, '.git'))) {
    console.log('检测到已有酒馆助手，执行更新…');
    run('git pull origin main', HELPER_DIR);
  } else {
    console.log('克隆 JS-Slash-Runner…');
    run(`git clone --depth 1 "${HELPER_REPO}" "${HELPER_DIR}"`);
  }

  // 安装酒馆助手自身的依赖（若有 package.json）
  const helperPkg = path.join(HELPER_DIR, 'package.json');
  if (fs.existsSync(helperPkg)) {
    console.log('安装酒馆助手依赖…');
    run('npm install --omit=dev', HELPER_DIR);
  }

  console.log('✅ 酒馆助手就绪');
}

// ─── 步骤 3：修改 ST 配置预启用酒馆助手 ───────────────────────
function patchSTConfig() {
  console.log('\n═══════════════════════════════════════');
  console.log('  步骤 3：配置 SillyTavern');
  console.log('═══════════════════════════════════════');

  // ST 的用户数据在 ./data/default-user/ 下
  const dataDir = path.join(ST_DIR, 'data', 'default-user');
  ensureDir(dataDir);

  // 1. 扩展状态文件：确保 JS-Slash-Runner 为 enabled
  const extDir = path.join(dataDir, 'extensions');
  ensureDir(extDir);
  const extStateFile = path.join(extDir, 'JS-Slash-Runner.json');
  const extState = { enabled: true, version: null };
  fs.writeFileSync(extStateFile, JSON.stringify(extState, null, 2));
  console.log('✅ 酒馆助手扩展已标记为启用');

  // 2. ST 全局配置：关闭 CSRF（Electron 内部访问不需要）
  const configSrc = path.join(ST_DIR, 'config.yaml');
  const configDst = path.join(ST_DIR, 'config.yaml');
  if (fs.existsSync(configSrc)) {
    let cfg = fs.readFileSync(configSrc, 'utf8');
    // 关闭 whitelistMode，允许本地 Electron 访问
    cfg = cfg.replace(/whitelistMode:\s*true/, 'whitelistMode: false');
    // 禁止自动打开浏览器
    cfg = cfg.replace(/autorun:\s*true/, 'autorun: false');
    fs.writeFileSync(configDst, cfg);
    console.log('✅ ST config.yaml 已调整');
  } else {
    // 生成最小配置
    const minConfig = `# SillyTavern config (auto-generated by novel-creator setup)
listen: true
port: 8000
whitelistMode: false
autorun: false
disableCsrf: true
`;
    fs.writeFileSync(configSrc, minConfig);
    console.log('✅ 生成 ST config.yaml');
  }
}

// ─── 步骤 4：下载前端依赖到 vendor/ ────────────────────────────
async function downloadVendorDeps() {
  console.log('\n═══════════════════════════════════════');
  console.log('  步骤 4：下载前端依赖到 vendor/');
  console.log('═══════════════════════════════════════');

  ensureDir(VENDOR_DIR);

  for (const dep of CDN_DEPS) {
    const dest = path.join(VENDOR_DIR, dep.file);
    if (fs.existsSync(dest)) {
      console.log(`  跳过（已存在）: ${dep.file}`);
      continue;
    }
    process.stdout.write(`  下载 ${dep.file}…`);
    try {
      await downloadFile(dep.url, dest);
      console.log(' ✅');
    } catch (e) {
      console.log(` ⚠️ 失败 (${e.message})，将降级使用 CDN`);
    }
  }
}

// ─── 步骤 5：提示下载 Node.js 便携版 ───────────────────────────
function printNodeGuide() {
  console.log('\n═══════════════════════════════════════');
  console.log('  步骤 5：准备便携版 Node.js（用于子进程）');
  console.log('═══════════════════════════════════════');
  console.log(`
SillyTavern 服务器需要 Node.js 18+ 运行时。
Electron 打包时需要在 resources/node/ 放一份便携版 node.exe。

请手动完成以下操作：

  1. 访问 https://nodejs.org/en/download/releases
  2. 下载 node-v20.x.x-win-x64.zip（Windows 便携版）
  3. 解压，将 node.exe 放到：

       项目根目录/resources/node/node.exe

     目录结构：
       resources/
         node/
           node.exe   ← 就是这个

  4. 完成后执行打包：
       npm run build:win

也可运行自动下载脚本（需要网络）：
  node scripts/download-node.js
`);
}

// ─── 主流程 ────────────────────────────────────────────────────
(async () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   自动化小说创作系统 — 环境初始化脚本     ║');
  console.log('╚══════════════════════════════════════════╝');

  try {
    await setupSillyTavern();
    await setupTavernHelper();
    patchSTConfig();
    await downloadVendorDeps();
    printNodeGuide();

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   初始化完成！                             ║');
    console.log('║                                           ║');
    console.log('║   下一步：                                ║');
    console.log('║   1. 将 auto.js 放入项目根目录             ║');
    console.log('║   2. 准备 resources/node/node.exe          ║');
    console.log('║   3. npm install                           ║');
    console.log('║   4. npm start  （开发测试）               ║');
    console.log('║   5. npm run build:win  （打包 exe）        ║');
    console.log('╚══════════════════════════════════════════╝\n');
  } catch (err) {
    console.error('\n❌ 初始化失败:', err.message);
    process.exit(1);
  }
})();
