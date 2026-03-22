#!/usr/bin/env node
/**
 * scripts/setup.js
 * 
 * 一键初始化：npm run setup
 * 顺序：检测Node → 下载ST → 下载酒馆助手 → 下载CDN依赖 → npm install
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const downloader = require('./downloader');

const ROOT = path.resolve(__dirname, '..');
const RES_DIR = path.join(ROOT, 'resources');
const ST_DIR = path.join(RES_DIR, 'sillytavern');
const NODE_DIR = path.join(RES_DIR, 'node');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const DOWNLOAD_DIR = path.join(ROOT, 'download');

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

// ─── 主流程 ───────────────────────────────────────────────────
(async () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   自动化小说创作系统 — 环境初始化          ║');
  console.log('╚══════════════════════════════════════════╝');

  try {
    // 1. 检测 Node.js
    console.log('\n══════════════════════════════════════');
    console.log('  步骤 1：检测 Node.js');
    console.log('══════════════════════════════════════');

    const systemNode = downloader.detectSystemNode();
    let nodeBin = null;

    if (systemNode) {
      console.log(`✅ 系统 Node.js: ${systemNode.version} @ ${systemNode.path}`);
      nodeBin = systemNode.path;
    } else {
      console.log('系统未检测到 Node.js (>= v18)，准备下载...');
      nodeBin = await downloader.downloadNode(NODE_DIR, DOWNLOAD_DIR, (msg) => {
        console.log(msg);
      });
      if (nodeBin) {
        console.log(`✅ Node.js 下载成功`);
      } else {
        throw new Error('Node.js 下载失败，请手动安装 Node.js (>= v18)');
      }
    }

    // 2. 下载 SillyTavern
    console.log('\n══════════════════════════════════════');
    console.log('  步骤 2：下载 SillyTavern');
    console.log('══════════════════════════════════════');

    const stSuccess = await downloader.downloadSillyTavern(ST_DIR, DOWNLOAD_DIR, (msg) => {
      console.log(msg);
    });

    if (!stSuccess && !fs.existsSync(path.join(ST_DIR, 'server.js'))) {
      throw new Error('SillyTavern 下载失败');
    }
    console.log('✅ SillyTavern 就绪');

    // 3. 下载酒馆助手
    console.log('\n══════════════════════════════════════');
    console.log('  步骤 3：下载酒馆助手');
    console.log('══════════════════════════════════════');

    await downloader.downloadTavernHelper(ST_DIR, DOWNLOAD_DIR, (msg) => {
      console.log(msg);
    });
    console.log('✅ 酒馆助手就绪');

    // 4. 创建配置
    console.log('\n══════════════════════════════════════');
    console.log('  步骤 4：创建默认配置');
    console.log('══════════════════════════════════════');

    downloader.createDefaultConfig(ST_DIR, 8000);
    console.log('✅ 配置已创建');

    // 5. 下载前端依赖
    console.log('\n══════════════════════════════════════');
    console.log('  步骤 5：下载前端依赖');
    console.log('══════════════════════════════════════');

    await downloader.downloadVendorDeps(VENDOR_DIR, (msg) => {
      console.log(`  ${msg}`);
    });

    // 6. npm install
    console.log('\n══════════════════════════════════════');
    console.log('  步骤 6：安装依赖');
    console.log('══════════════════════════════════════');

    console.log('\n安装项目依赖...');
    run('npm install', ROOT);

    console.log('\n安装 SillyTavern 依赖...');
    await downloader.installDependencies(ST_DIR, nodeBin, 'https://registry.npmmirror.com', (msg) => {
      console.log(msg);
    });

    // 完成
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   初始化完成！                             ║');
    console.log('║                                           ║');
    console.log('║   开发阶段步骤：                          ║');
    console.log('║   1. 将 auto.js 放到项目根目录            ║');
    console.log('║   2. npm start       启动应用            ║');
    console.log('║                                           ║');
    console.log('║   打包：                                  ║');
    console.log('║   npm run build      打包 exe            ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // 检查 auto.js 是否存在
    const autoJsPath = path.join(ROOT, 'auto.js');
    if (!fs.existsSync(autoJsPath)) {
      console.log('⚠️  警告: auto.js 不存在于项目根目录！');
      console.log('   请将 auto.js 复制到:', autoJsPath);
      console.log('');
    }
  } catch (err) {
    console.error('\n❌ 初始化失败:', err.message);
    process.exit(1);
  }
})();
