#!/usr/bin/env node
/**
 * scripts/first-run-setup.js
 * 
 * 首次运行时的初始化脚本
 * 检测系统Node.js，下载SillyTavern，安装依赖
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const os = require('os');

// ─── 配置 ─────────────────────────────────────────────────────
const NODE_VERSION = '20.18.1';
const ST_REPO_ZIP = 'https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip';
const ST_REPO_ZIP_MIRROR = 'https://gitee.com/boomer027/SillyTavern/repository/archive/release.zip';

// ─── 路径 ─────────────────────────────────────────────────────
function getDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'novel-creator');
  }
  return path.join(os.homedir(), '.novel-creator');
}

const DATA_DIR = getDataDir();
const NODE_DIR = path.join(DATA_DIR, 'node');
const NODE_BIN = path.join(NODE_DIR, process.platform === 'win32' ? 'node.exe' : 'bin', 'node');
const ST_DIR = path.join(DATA_DIR, 'sillytavern');
const ST_SERVER = path.join(ST_DIR, 'server.js');

// ─── 日志 ─────────────────────────────────────────────────────
function log(tag, msg) {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`[${time}][${tag}] ${msg}`);
}

// ─── 系统 Node.js 检测 ─────────────────────────────────────────
function detectSystemNode() {
  log('Setup', '检测系统 Node.js...');
  try {
    const result = spawnSync('node', ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true
    });
    if (result.status === 0 && result.stdout) {
      const version = result.stdout.trim();
      const majorMatch = version.match(/^v?(\d+)/);
      if (majorMatch && parseInt(majorMatch[1]) >= 18) {
        const whichResult = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
          encoding: 'utf8',
          stdio: 'pipe',
          shell: true
        });
        if (whichResult.status === 0 && whichResult.stdout) {
          const nodePath = whichResult.stdout.trim().split('\n')[0].trim();
          log('Setup', `系统 Node.js: ${version} @ ${nodePath}`);
          return nodePath;
        }
      }
    }
  } catch (e) {
    log('Setup', `检测失败: ${e.message}`);
  }
  return null;
}

// ─── 下载文件 ─────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const tmpDest = dest + '.tmp';
    const file = fs.createWriteStream(tmpDest);
    let downloaded = 0;
    let total = 0;

    const doRequest = (requestUrl) => {
      const proto = requestUrl.startsWith('https') ? https : http;
      proto.get(requestUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        total = parseInt(res.headers['content-length'] || '0', 10);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmpDest, dest);
            resolve();
          });
        });
      }).on('error', (e) => {
        try { fs.unlinkSync(tmpDest); } catch (_) { }
        reject(e);
      });
    };

    doRequest(url);
  });
}

// ─── 下载 Node.js ─────────────────────────────────────────────
async function downloadNode() {
  if (fs.existsSync(NODE_BIN)) {
    try {
      const v = execSync(`"${NODE_BIN}" --version`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      log('Setup', `Node.js 已存在: ${v}`);
      return NODE_BIN;
    } catch (_) { }
  }

  log('Setup', `下载 Node.js v${NODE_VERSION}...`);
  const urls = [
    `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
    `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`
  ];
  const zipPath = path.join(NODE_DIR, 'node.zip');

  for (const url of urls) {
    try {
      await downloadFile(url, zipPath);
      log('Setup', '解压 Node.js...');
      
      const extractDir = path.join(NODE_DIR, 'extract');
      if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
      
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' });
      
      const folders = fs.readdirSync(extractDir);
      if (folders.length > 0) {
        const nodeExe = path.join(extractDir, folders[0], 'node.exe');
        if (fs.existsSync(nodeExe)) {
          fs.copyFileSync(nodeExe, NODE_BIN);
        }
      }
      
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      try { fs.unlinkSync(zipPath); } catch (_) { }
      
      const v = execSync(`"${NODE_BIN}" --version`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      log('Setup', `Node.js 安装成功: ${v}`);
      return NODE_BIN;
    } catch (e) {
      log('Setup', `失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }
  throw new Error('Node.js 下载失败');
}

// ─── 下载 SillyTavern ─────────────────────────────────────────
async function downloadSillyTavern() {
  if (fs.existsSync(ST_SERVER)) {
    log('Setup', 'SillyTavern 已存在');
    return ST_DIR;
  }

  log('Setup', '下载 SillyTavern...');
  const urls = [ST_REPO_ZIP, ST_REPO_ZIP_MIRROR];
  const zipPath = path.join(DATA_DIR, 'sillytavern.zip');

  for (const url of urls) {
    try {
      await downloadFile(url, zipPath);
      log('Setup', '解压 SillyTavern...');
      
      const extractDir = path.join(DATA_DIR, 'st-extract');
      if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
      
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' });
      
      const folders = fs.readdirSync(extractDir);
      if (folders.length > 0) {
        fs.renameSync(path.join(extractDir, folders[0]), ST_DIR);
      }
      
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      try { fs.unlinkSync(zipPath); } catch (_) { }
      
      log('Setup', 'SillyTavern 安装成功');
      return ST_DIR;
    } catch (e) {
      log('Setup', `失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }
  throw new Error('SillyTavern 下载失败');
}

// ─── 安装依赖 ─────────────────────────────────────────────────
async function installDependencies(nodeBin) {
  const nodeModules = path.join(ST_DIR, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    log('Setup', '依赖已存在');
    return;
  }

  log('Setup', '安装 SillyTavern 依赖...');
  try {
    execSync(`"${nodeBin}" "node_modules/npm/bin/npm-cli.js" install --omit=dev`, {
      cwd: ST_DIR,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    log('Setup', '依赖安装完成');
  } catch (e) {
    throw new Error(`依赖安装失败: ${e.message}`);
  }
}

// ─── 主流程 ───────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  首次运行初始化');
  console.log('══════════════════════════════════════════\n');

  // 确保数据目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. 检测/下载 Node.js
  let nodeBin = detectSystemNode();
  if (!nodeBin) {
    nodeBin = await downloadNode();
  }

  // 2. 下载 SillyTavern
  await downloadSillyTavern();

  // 3. 安装依赖
  await installDependencies(nodeBin);

  console.log('\n══════════════════════════════════════════');
  console.log('  初始化完成！');
  console.log('══════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('\n[ERROR]', e.message);
  process.exit(1);
});
