/**
 * main.js — Electron 主进程
 * 绿色免安装版：不打包Node和SillyTavern，运行时下载
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');

// ─── 全局配置 ─────────────────────────────────────────────────
let ST_PORT = 8000;
const ST_PORT_RANGE_START = 18000;
const ST_PORT_RANGE_END = 18100;
const NODE_VERSION = '20.18.1';
const ST_REPO_ZIP = 'https://ghproxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip';

// ─── 查找可用端口 ─────────────────────────────────────────────
function findAvailablePort(startPort, endPort) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    let port = startPort;
    function tryPort() {
      if (port > endPort) {
        reject(new Error(`端口范围 ${startPort}-${endPort} 内无可用端口`));
        return;
      }
      const server = net.createServer();
      server.once('error', () => { port++; tryPort(); });
      server.once('listening', () => { server.close(() => resolve(port)); });
      server.listen(port, '127.0.0.1');
    }
    tryPort();
  });
}

// ─── 路径定义（所有文件在exe同级目录）──────────────────────────
const isDev = !app.isPackaged;
const APP_DIR = isDev ? __dirname : path.dirname(process.execPath);

const DATA_DIR = path.join(APP_DIR, 'data');
const DOWNLOAD_DIR = path.join(APP_DIR, 'download');
const RESOURCES_DIR = path.join(APP_DIR, 'resources');

const NODE_DIR = path.join(RESOURCES_DIR, 'node');
const NODE_BIN = path.join(NODE_DIR, process.platform === 'win32' ? 'node.exe' : 'bin', 'node');
const ST_DIR = path.join(RESOURCES_DIR, 'sillytavern');
const ST_SERVER = path.join(ST_DIR, 'server.js');
const ST_CONFIG = path.join(ST_DIR, 'config.yaml');
const VENDOR_DIR = path.join(APP_DIR, 'vendor');

const PID_FILE = path.join(DATA_DIR, 'st-process.pid');
const LOG_FILE = path.join(DATA_DIR, 'launcher.log');

// ─── 全局变量 ─────────────────────────────────────────────────
let mainWindow = null;
let splashWindow = null;
let logWindow = null;
let stProcess = null;
let logStream = null;
let systemNodePath = null;

// ─── 终端日志系统 ─────────────────────────────────────────────
function initLogStream() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      try { fs.unlinkSync(LOG_FILE); } catch (_) { }
    }
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'w', encoding: 'utf8' });
    logStream.write(`=== 自动化小说创作系统 日志 ===\n`);
    logStream.write(`时间: ${new Date().toLocaleString('zh-CN')}\n`);
    logStream.write(`平台: ${process.platform} ${os.arch()}\n`);
    logStream.write(`应用目录: ${APP_DIR}\n`);
    logStream.write(`============================\n\n`);
  } catch (e) {
    console.error('初始化日志流失败:', e.message);
  }
}

function log(tag, msg) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const line = `[${timestamp}][${tag}] ${String(msg)}`;
  console.log(line);
  if (logStream && logStream.writable && !logStream.destroyed) {
    try { logStream.write(line + '\n'); } catch (_) { }
  }
  updateLogWindow(line);
}

function updateLogWindow(line) {
  if (logWindow && !logWindow.isDestroyed()) {
    const escaped = JSON.stringify(line);
    logWindow.webContents.executeJavaScript(`
      if (window.addLog) window.addLog(${escaped});
    `).catch(() => { });
  }
}

// ─── PID 管理 ─────────────────────────────────────────────────
function writePID(pid) { try { fs.writeFileSync(PID_FILE, String(pid), 'utf8'); } catch (_) { } }
function readPID() { try { return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10) || null; } catch (_) { return null; } }
function clearPID() { try { fs.unlinkSync(PID_FILE); } catch (_) { } }

// ─── 按 PID 杀进程树 ──────────────────────────────────────────
function killByPID(pid) {
  if (!pid) return;
  log('App', `杀进程树 PID=${pid}`);
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' }); } catch (_) { }
}

// ─── 按端口杀进程 ─────────────────────────────────────────────
function killByPort(port) {
  try {
    const r = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`],
      { encoding: 'utf8', stdio: 'pipe' });
    const m = r.stdout && r.stdout.match(/LISTENING\s+(\d+)/);
    if (m) {
      const pid = parseInt(m[1], 10);
      log('App', `端口 ${port} 被 PID=${pid} 占用，释放...`);
      spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    }
  } catch (_) { }
}

// ─── 强杀当前 ST ──────────────────────────────────────────────
function killST() {
  if (stProcess && !stProcess.killed) {
    const pid = stProcess.pid;
    log('App', `终止 ST PID=${pid}`);
    try { stProcess.kill('SIGTERM'); } catch (_) { }
    if (process.platform === 'win32') killByPID(pid);
    stProcess = null;
  }
  clearPID();
}

// ─── 启动前清理孤儿进程 ────────────────────────────────────────
function cleanupOrphanProcess() {
  const savedPID = readPID();
  if (savedPID) {
    log('App', `清理上次遗留 ST 进程 PID=${savedPID}`);
    killByPID(savedPID);
    clearPID();
  }
  if (process.platform === 'win32') killByPort(ST_PORT);
}

// ─── 系统 Node.js 检测 ─────────────────────────────────────────
function detectSystemNode() {
  log('Setup', '开始检测系统 Node.js...');
  try {
    const result = spawnSync('node', ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true
    });
    if (result.status === 0 && result.stdout) {
      const version = result.stdout.trim();
      log('Setup', `系统 Node.js 版本: ${version}`);
      const majorMatch = version.match(/^v?(\d+)/);
      if (majorMatch && parseInt(majorMatch[1]) >= 18) {
        const whichResult = spawnSync('where', ['node'], {
          encoding: 'utf8',
          stdio: 'pipe',
          shell: true
        });
        if (whichResult.status === 0 && whichResult.stdout) {
          const nodePath = whichResult.stdout.trim().split('\n')[0].trim();
          log('Setup', `系统 Node.js 路径: ${nodePath}`);
          systemNodePath = nodePath;
          return nodePath;
        }
      } else {
        log('Setup', `系统 Node.js 版本过低 (${version})，需要 >= v18`);
      }
    }
  } catch (e) {
    log('Setup', `系统 Node.js 检测失败: ${e.message}`);
  }
  log('Setup', '系统未找到合适的 Node.js');
  return null;
}

// ─── 下载文件（带进度）────────────────────────────────────────
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const tmpDest = dest + '.tmp';
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let downloaded = 0;
    let total = 0;
    const doRequest = (requestUrl) => {
      log('Download', `请求: ${requestUrl}`);
      const req = proto.get(requestUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          log('Download', `重定向到: ${res.headers.location}`);
          return doRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        total = parseInt(res.headers['content-length'] || '0', 10);
        const file = fs.createWriteStream(tmpDest);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (onProgress && total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            onProgress(downloaded, total, pct);
          }
        });
        res.on('end', () => {
          file.close(() => {
            try {
              fs.renameSync(tmpDest, dest);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
        res.on('error', (e) => {
          file.close();
          try { fs.unlinkSync(tmpDest); } catch (_) { }
          reject(e);
        });
      });
      req.on('error', (e) => {
        try { fs.unlinkSync(tmpDest); } catch (_) { }
        reject(e);
      });
      req.setTimeout(60000, () => {
        req.destroy();
        try { fs.unlinkSync(tmpDest); } catch (_) { }
        reject(new Error('下载超时'));
      });
    };
    doRequest(url);
  });
}

// ─── 下载并解压 Node.js ──────────────────────────────────────
async function downloadNode(onProgress) {
  if (isDev) {
    log('Setup', '开发模式：跳过 Node.js 下载，使用系统 Node');
    return systemNodePath;
  }

  log('Setup', `开始下载 Node.js v${NODE_VERSION}...`);

  if (fs.existsSync(NODE_BIN)) {
    try {
      const v = execSync(`"${NODE_BIN}" --version`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      log('Setup', `Node.js 已存在: ${v}`);
      return NODE_BIN;
    } catch (_) {
      log('Setup', '已存在但无法运行，重新下载...');
      try { fs.rmSync(NODE_DIR, { recursive: true, force: true }); } catch (_) { }
    }
  }

  const nodeZipUrl = `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  const nodeZipMirror = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  const zipPath = path.join(DOWNLOAD_DIR, 'node.zip');

  const urls = [nodeZipUrl, nodeZipMirror];

  for (const url of urls) {
    try {
      log('Setup', `尝试下载: ${url}`);
      let lastLogPct = 0;
      await downloadFile(url, zipPath, (current, total, pct) => {
        if (onProgress) onProgress(`下载 Node.js: ${pct}%`);
        const pctNum = parseFloat(pct);
        if (pctNum - lastLogPct >= 1) {
          log('Download', `进度: ${pct}% (${(current / 1024 / 1024).toFixed(1)}MB)`);
          lastLogPct = pctNum;
        }
      });

      log('Setup', '解压 Node.js...');
      if (!fs.existsSync(NODE_DIR)) fs.mkdirSync(NODE_DIR, { recursive: true });

      try {
        const psScript = path.join(DOWNLOAD_DIR, '_extract_node.ps1');
        fs.writeFileSync(psScript, `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${NODE_DIR.replace(/'/g, "''")}' -Force`);
        execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'pipe' });
        try { fs.unlinkSync(psScript); } catch (_) { }

        const extractedFolders = fs.readdirSync(NODE_DIR).filter(f => f.startsWith('node-v'));
        if (extractedFolders.length > 0) {
          const extractedDir = path.join(NODE_DIR, extractedFolders[0]);
          const files = fs.readdirSync(extractedDir);
          for (const file of files) {
            const src = path.join(extractedDir, file);
            const dest = path.join(NODE_DIR, file);
            if (fs.existsSync(dest)) {
              if (fs.statSync(dest).isDirectory()) {
                fs.rmSync(dest, { recursive: true, force: true });
              } else {
                fs.unlinkSync(dest);
              }
            }
            fs.renameSync(src, dest);
          }
          fs.rmdirSync(extractedDir);
        }

        try { fs.unlinkSync(zipPath); } catch (_) { }

        const v = execSync(`"${NODE_BIN}" --version`, { encoding: 'utf8', stdio: 'pipe' }).trim();
        log('Setup', `Node.js 安装成功: ${v}`);
        return NODE_BIN;
      } catch (e) {
        log('Setup', `解压失败: ${e.message}`);
        throw e;
      }
    } catch (e) {
      log('Setup', `下载失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }

  throw new Error('所有 Node.js 下载源均失败');
}

// ─── 下载并解压 SillyTavern ──────────────────────────────────
async function downloadSillyTavern(onProgress) {
  if (isDev) {
    if (fs.existsSync(ST_SERVER)) {
      log('Setup', `开发模式：使用本地 SillyTavern @ ${ST_DIR}`);
      return ST_DIR;
    }
    throw new Error(`开发模式：找不到 SillyTavern\n路径: ${ST_SERVER}\n请先运行: npm run setup`);
  }

  log('Setup', '开始下载 SillyTavern...');

  if (fs.existsSync(ST_SERVER)) {
    log('Setup', 'SillyTavern 已存在');
    return ST_DIR;
  }

  const zipPath = path.join(DOWNLOAD_DIR, 'sillytavern.zip');
  const extractDir = path.join(DOWNLOAD_DIR, 'st-extract');

  if (fs.existsSync(zipPath)) {
    log('Setup', '发现已下载的压缩包，直接解压...');
    await extractSillyTavern(zipPath, extractDir);
    return ST_DIR;
  }

  const urls = [
    'https://ghproxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
    'https://gh-proxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
    'https://ghps.cc/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
    ST_REPO_ZIP,
  ];

  for (const url of urls) {
    try {
      log('Setup', `尝试下载: ${url}`);
      let lastLogPct = 0;
      await downloadFile(url, zipPath, (current, total, pct) => {
        if (onProgress) onProgress(`下载 SillyTavern: ${pct}%`);
        const pctNum = parseFloat(pct);
        if (pctNum - lastLogPct >= 1) {
          log('Download', `进度: ${pct}% (${(current / 1024 / 1024).toFixed(1)}MB)`);
          lastLogPct = pctNum;
        }
      });

      await extractSillyTavern(zipPath, extractDir);
      return ST_DIR;
    } catch (e) {
      log('Setup', `下载失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }

  throw new Error('所有 SillyTavern 下载源均失败');
}

// ─── 解压 SillyTavern ─────────────────────────────────────────
async function extractSillyTavern(zipPath, extractDir) {
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
  if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

  log('Setup', '解压 SillyTavern...');
  try {
    const psScript = path.join(DOWNLOAD_DIR, '_extract.ps1');
    fs.writeFileSync(psScript, `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`);
    execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'pipe' });
    try { fs.unlinkSync(psScript); } catch (_) { }

    const extractedFolders = fs.readdirSync(extractDir);
    if (extractedFolders.length > 0) {
      const stFolder = path.join(extractDir, extractedFolders[0]);
      try { fs.rmSync(ST_DIR, { recursive: true, force: true }); } catch (_) { }
      fs.renameSync(stFolder, ST_DIR);
      log('Setup', `SillyTavern 已安装: ${ST_DIR}`);
    }

    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }

    if (!fs.existsSync(ST_SERVER)) {
      throw new Error('server.js 不存在');
    }

    log('Setup', 'SillyTavern 安装成功');
  } catch (e) {
    log('Setup', `解压失败: ${e.message}`);
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
    throw e;
  }
}

// ─── 下载安装酒馆助手 ─────────────────────────────────────────
async function setupTavernHelper(onProgress) {
  if (isDev) {
    log('Setup', '开发模式：跳过酒馆助手安装');
    return;
  }

  const EXT_DIR = path.join(ST_DIR, 'public', 'scripts', 'extensions', 'third-party');
  const HELPER_DIR = path.join(EXT_DIR, 'JS-Slash-Runner');
  const HELPER_REPO_ZIP = 'https://github.com/N0VI028/JS-Slash-Runner/archive/refs/heads/main.zip';
  const HELPER_REPO_ZIP_MIRROR = 'https://ghproxy.com/https://github.com/N0VI028/JS-Slash-Runner/archive/refs/heads/main.zip';

  if (fs.existsSync(path.join(HELPER_DIR, 'package.json'))) {
    log('Setup', '酒馆助手已存在，跳过安装');
    return;
  }

  log('Setup', '开始下载酒馆助手...');
  if (onProgress) onProgress('下载酒馆助手...');

  const zipPath = path.join(DOWNLOAD_DIR, 'tavern-helper.zip');
  const extractDir = path.join(DOWNLOAD_DIR, 'tavern-helper-extract');

  const urls = [HELPER_REPO_ZIP_MIRROR, HELPER_REPO_ZIP];

  for (const url of urls) {
    try {
      await downloadFile(url, zipPath, (current, total, pct) => {
        if (onProgress) onProgress(`下载酒馆助手: ${pct}%`);
      });

      log('Setup', '解压酒馆助手...');
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

      const psScript = path.join(DOWNLOAD_DIR, '_extract_helper.ps1');
      fs.writeFileSync(psScript, `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`);
      execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'pipe' });
      try { fs.unlinkSync(psScript); } catch (_) { }

      const extractedFolders = fs.readdirSync(extractDir);
      if (extractedFolders.length > 0) {
        const helperFolder = path.join(extractDir, extractedFolders[0]);
        if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
        try { fs.rmSync(HELPER_DIR, { recursive: true, force: true }); } catch (_) { }
        fs.renameSync(helperFolder, HELPER_DIR);
        log('Setup', `酒馆助手已安装: ${HELPER_DIR}`);
      }

      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      try { fs.unlinkSync(zipPath); } catch (_) { }

      const extStateDir = path.join(ST_DIR, 'data', 'default-user', 'extensions');
      if (!fs.existsSync(extStateDir)) fs.mkdirSync(extStateDir, { recursive: true });
      fs.writeFileSync(path.join(extStateDir, 'JS-Slash-Runner.json'), JSON.stringify({ enabled: true }, null, 2));

      log('Setup', '酒馆助手安装完成');
      return;
    } catch (e) {
      log('Setup', `酒馆助手下载失败: ${e.message}`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }

  log('Setup:ERR', '酒馆助手下载失败，但不影响主程序运行');
}

// ─── 安装 SillyTavern 依赖 ───────────────────────────────────
async function installSTDependencies(onProgress) {
  if (isDev) {
    log('Setup', '开发模式：跳过依赖安装');
    return;
  }

  const nodeModulesDir = path.join(ST_DIR, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    log('Setup', 'SillyTavern 依赖已存在，跳过安装');
    return;
  }

  const nodeBin = systemNodePath || NODE_BIN;
  log('Setup', '安装 SillyTavern 依赖...');
  log('Setup', `使用 Node: ${nodeBin}`);
  if (onProgress) onProgress('安装 SillyTavern 依赖...');

  return new Promise((resolve, reject) => {
    const isUsingDownloadedNode = !systemNodePath;
    const npmCmd = isUsingDownloadedNode ? `"${nodeBin}" npm` : 'npm';
    const npmArgs = ['install', '--omit=dev', '--registry', 'https://registry.npmmirror.com'];

    log('Setup', `npm 命令: ${npmCmd} ${npmArgs.join(' ')}`);

    const npmProcess = spawn(npmCmd, npmArgs, {
      cwd: ST_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PATH: isUsingDownloadedNode ? `${NODE_DIR};${process.env.PATH}` : process.env.PATH
      }
    });

    npmProcess.stdout.on('data', (d) => {
      const line = d.toString('utf8').trim();
      if (line) log('npm', line);
    });

    npmProcess.stderr.on('data', (d) => {
      const line = d.toString('utf8').trim();
      if (line) log('npm:ERR', line);
    });

    npmProcess.on('close', (code) => {
      if (code === 0) {
        log('Setup', '依赖安装完成');
        resolve();
      } else {
        reject(new Error(`npm install 退出码: ${code}`));
      }
    });

    npmProcess.on('error', (e) => {
      reject(new Error(`npm install 失败: ${e.message}`));
    });
  });
}

// ─── 修补 ST 配置 ─────────────────────────────────────────────
function patchSTConfig() {
  try {
    let content = '';
    if (fs.existsSync(ST_CONFIG)) {
      content = fs.readFileSync(ST_CONFIG, 'utf8');
      content = content.replace(/^autorun\s*:.+$/m, 'autorun: false');
      content = content.replace(/^whitelistMode\s*:.+$/m, 'whitelistMode: false');
      content = content.replace(/^port\s*:.+$/m, `port: ${ST_PORT}`);
      if (!/^autorun\s*:/m.test(content)) content += '\nautorun: false';
      if (!/^whitelistMode\s*:/m.test(content)) content += '\nwhitelistMode: false';
      if (!/^port\s*:/m.test(content)) content += `\nport: ${ST_PORT}`;
    } else {
      const dir = path.dirname(ST_CONFIG);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      content = `listen: true\nport: ${ST_PORT}\nautorun: false\nwhitelistMode: false\ndisableCsrf: true\n`;
    }
    fs.writeFileSync(ST_CONFIG, content, 'utf8');
    log('App', `ST config.yaml 已配置 (端口: ${ST_PORT})`);
  } catch (e) {
    log('App', `修改 ST config 失败: ${e.message}`);
  }
}

// ─── 创建日志窗口 ─────────────────────────────────────────────
function createLogWindow() {
  return new Promise((resolve) => {
    logWindow = new BrowserWindow({
      width: 700,
      height: 500,
      title: '系统日志',
      backgroundColor: '#0c0c0c',
      show: false,
      alwaysOnTop: false,
      resizable: true,
      minimizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const logHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>系统日志</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0c0c0c;
      color: #cccccc;
      font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
      font-size: 12px;
      padding: 8px;
      overflow: hidden;
    }
    #header {
      background: #1f1f1f;
      color: #00ff00;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: bold;
      border-bottom: 1px solid #333;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #log-container {
      height: calc(100vh - 50px);
      overflow-y: auto;
      padding: 4px;
    }
    #log-container::-webkit-scrollbar { width: 8px; }
    #log-container::-webkit-scrollbar-track { background: #1a1a1a; }
    #log-container::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
    .log-line {
      padding: 1px 4px;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.4;
    }
    .log-line:hover { background: #1a1a1a; }
    .tag-Setup { color: #00bfff; }
    .tag-ST { color: #00ff00; }
    .tag-App { color: #ffff00; }
    .tag-Download { color: #ff8c00; }
    .tag-ERR { color: #ff4444; }
    .tag-npm { color: #cc77ff; }
    .tag-Window { color: #00ffff; }
    #status { font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <div id="header">
    <span>系统日志 - 自动化小说创作系统</span>
    <span id="status">等待中...</span>
  </div>
  <div id="log-container">
    <div id="log-content"></div>
  </div>
  <script>
    const logContent = document.getElementById('log-content');
    const statusEl = document.getElementById('status');
    let lineCount = 0;

    window.addLog = function(line) {
      const div = document.createElement('div');
      div.className = 'log-line';

      const tagMatch = line.match(/\\[([^\\]]+)\\]/);
      if (tagMatch) {
        const tag = tagMatch[1];
        let tagClass = 'tag-' + tag.replace(/:.*$/, '');
        if (tag.includes('ERR')) tagClass = 'tag-ERR';
        div.innerHTML = line.replace(/\\[([^\\]]+)\\]/, '<span class="' + tagClass + '">[$1]</span>');
      } else {
        div.textContent = line;
      }

      logContent.appendChild(div);
      lineCount++;
      statusEl.textContent = '行数: ' + lineCount;

      const container = document.getElementById('log-container');
      container.scrollTop = container.scrollHeight;
    };

    addLog('[App] 日志窗口已就绪');
  </script>
</body>
</html>`;

    logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(logHtml));

    logWindow.once('ready-to-show', () => {
      logWindow.show();
      resolve();
    });

    logWindow.on('closed', () => {
      logWindow = null;
    });
  });
}

// ─── 更新启动画面状态 ─────────────────────────────────────────
function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.executeJavaScript(
    `var el=document.getElementById('status-text');if(el)el.textContent=${JSON.stringify(text)}`
  ).catch(() => { });
}

// ─── 等待 ST 就绪 ─────────────────────────────────────────────
function waitForST(maxRetries = 300, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      if (tries % 10 === 0 && tries > 0) {
        setSplashStatus(`等待服务就绪... (${tries}s)`);
        log('ST', `仍在等待... ${tries}s`);
      }
      const req = http.get(`http://127.0.0.1:${ST_PORT}`, (res) => {
        if (res.statusCode < 500) {
          log('ST', `服务就绪 HTTP ${res.statusCode}，等待了 ${tries}s`);
          setSplashStatus('服务就绪，加载界面中...');
          resolve();
        } else { retry(); }
        res.resume();
      });
      req.on('error', retry);
      req.setTimeout(900, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (++tries >= maxRetries) {
        reject(new Error(`SillyTavern ${maxRetries}s 内未能启动\n首次启动需编译前端库，约需 1~3 分钟`));
      } else { setTimeout(check, intervalMs); }
    };
    check();
  });
}

// ─── 启动 ST ──────────────────────────────────────────────────
function launchSillyTavern() {
  return new Promise((resolve, reject) => {
    const nodeBin = systemNodePath || NODE_BIN;

    if (!fs.existsSync(nodeBin)) {
      return reject(new Error(`找不到 Node.js: ${nodeBin}`));
    }
    if (!fs.existsSync(ST_SERVER)) {
      return reject(new Error(`找不到 SillyTavern: ${ST_SERVER}`));
    }

    patchSTConfig();

    log('ST', `Node:   ${nodeBin}`);
    log('ST', `Server: ${ST_SERVER}`);
    log('ST', `CWD:    ${ST_DIR}`);
    log('ST', `数据:   ${DATA_DIR}`);

    stProcess = spawn(nodeBin, [ST_SERVER, '--port', String(ST_PORT), '--no-csrf', '--dataRoot', DATA_DIR], {
      cwd: ST_DIR,
      env: {
        ...process.env,
        PORT: String(ST_PORT),
        NODE_ENV: 'production',
        ST_OPEN_BROWSER: 'false',
        OPEN_BROWSER: 'false',
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    if (stProcess.pid) {
      writePID(stProcess.pid);
      log('App', `ST PID=${stProcess.pid} 已记录`);
    }

    stProcess.stdout.on('data', (d) => {
      const line = d.toString('utf8').trim();
      if (!line) return;
      log('ST', line);
      if (line.includes('Compiling')) setSplashStatus('编译前端库（首次启动较慢）...');
      if (line.includes('SillyTavern is listening') || line.includes('Listening on')) resolve();
    });

    stProcess.stderr.on('data', (d) => {
      const l = d.toString('utf8').trim();
      if (l) log('ST:ERR', l);
    });

    stProcess.on('error', (err) => reject(err));

    stProcess.on('exit', (code) => {
      log('ST', `子进程退出 code=${code}`);
      clearPID();
      stProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(
          `alert('SillyTavern 退出 (code=${code})，请重启应用')`, true
        ).catch(() => { });
      }
    });

    setTimeout(resolve, 500);
  });
}

// ─── 启动画面 ─────────────────────────────────────────────────
function createSplashWindow() {
  return new Promise((resolve) => {
    splashWindow = new BrowserWindow({
      width: 440, height: 280,
      frame: false,
      transparent: false,
      alwaysOnTop: false,
      resizable: false,
      backgroundColor: '#080c18',
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    splashWindow.once('ready-to-show', () => {
      splashWindow.show();
      log('Splash', '启动画面已显示');
      resolve();
    });

    const splashHtmlPath = path.join(__dirname, 'splash.html');
    if (fs.existsSync(splashHtmlPath)) {
      splashWindow.loadFile(splashHtmlPath);
    } else {
      splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html><html><head><meta charset="utf-8">
        <style>body{margin:0;background:#080c18;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#e2e8f0;}</style>
        </head><body><div>正在启动...</div></body></html>
      `));
    }
  });
}

// ─── 主窗口 ───────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: '自动化小说创作系统', backgroundColor: '#1a1a2e', show: false,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
      sandbox: false, webSecurity: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${ST_PORT}`);
  mainWindow.once('ready-to-show', () => { mainWindow.show(); log('Window', '主窗口已显示'); });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isF12 = input.type === 'keyDown' && input.key === 'F12';
    const isCtrlShiftI = input.type === 'keyDown' && input.key === 'I'
      && (input.control || input.meta) && input.shift;
    if (isF12 || isCtrlShiftI) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${ST_PORT}`)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    killST();
    app.quit();
    setTimeout(() => process.exit(0), 100);
  });
}

// ─── 入口 ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  initLogStream();

  log('App', '═══════════════════════════════════════════════════');
  log('App', '  自动化小说创作系统 - Novel Creator');
  log('App', '═══════════════════════════════════════════════════');
  log('App', `平台: ${process.platform} ${os.arch()}`);
  log('App', `打包: ${app.isPackaged}`);
  log('App', `应用目录: ${APP_DIR}`);
  log('App', '═══════════════════════════════════════════════════');

  for (const dir of [DATA_DIR, DOWNLOAD_DIR, RESOURCES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  log('App', `数据目录: ${DATA_DIR}`);
  log('App', `下载目录: ${DOWNLOAD_DIR}`);
  log('App', `资源目录: ${RESOURCES_DIR}`);

  try {
    await createLogWindow();
    log('App', '日志窗口已创建');

    ST_PORT = await findAvailablePort(ST_PORT_RANGE_START, ST_PORT_RANGE_END);
    log('App', `分配端口: ${ST_PORT}`);

    cleanupOrphanProcess();

    await createSplashWindow();
    setSplashStatus('正在初始化...');

    setSplashStatus('检测系统环境...');
    const systemNode = detectSystemNode();

    if (systemNode) {
      log('Setup', `使用系统 Node.js: ${systemNode}`);
      setSplashStatus('使用系统 Node.js');
    } else {
      log('Setup', '系统未检测到 Node.js，准备下载...');
      setSplashStatus('下载 Node.js...');
      await downloadNode((status) => setSplashStatus(status));
    }

    setSplashStatus('检查 SillyTavern...');
    await downloadSillyTavern((status) => setSplashStatus(status));

    setSplashStatus('安装依赖...');
    await installSTDependencies((status) => setSplashStatus(status));

    setSplashStatus('检查酒馆助手...');
    await setupTavernHelper((status) => setSplashStatus(status));

    setSplashStatus('启动 SillyTavern...');
    await launchSillyTavern();
    await waitForST();

    createWindow();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();

    log('App', '═══════════════════════════════════════════════════');
    log('App', '  启动完成！');
    log('App', '═══════════════════════════════════════════════════');

  } catch (err) {
    log('App', `启动失败: ${err.message}`);
    log('App', err.stack || '');
    killST();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    app.quit();
    setTimeout(() => process.exit(1), 100);
  }
});

// ─── IPC 处理 ─────────────────────────────────────────────────
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('open-devtools', () => { if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' }); });
ipcMain.handle('get-app-path', () => APP_DIR);
ipcMain.handle('get-log-content', () => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return fs.readFileSync(LOG_FILE, 'utf8');
    }
  } catch (_) { }
  return '';
});

// ─── 应用生命周期 ─────────────────────────────────────────────
app.on('before-quit', () => { killST(); });
app.on('will-quit', () => {
  killST();
  if (logStream && !logStream.destroyed) {
    logStream.end();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    killST();
    app.quit();
    setTimeout(() => process.exit(0), 500);
  }
});

process.on('SIGINT', () => { killST(); process.exit(0); });
process.on('SIGTERM', () => { killST(); process.exit(0); });
process.on('uncaughtException', (err) => {
  log('App', `未捕获异常: ${err.message}`);
  killST();
  process.exit(1);
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
