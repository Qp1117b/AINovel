/**
 * main.js — Electron 主进程
 * 绿色免安装版：不打包Node和SillyTavern，运行时下载
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');

// ─── 引入统一下载模块 ─────────────────────────────────────────
const downloader = require('./scripts/downloader');

// ─── 全局配置 ─────────────────────────────────────────────────
let ST_PORT = 8000;
const ST_PORT_RANGE_START = 18000;
const ST_PORT_RANGE_END = 18100;

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

    // 数据存放在 ST 原目录下的 data 文件夹
    stProcess = spawn(nodeBin, [ST_SERVER, '--port', String(ST_PORT), '--no-csrf'], {
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
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('Window', '主窗口已显示');

    // 监听渲染进程的 console 输出
    mainWindow.webContents.on('console-message', (event, level, message) => {
      if (level >= 0) log('RENDER', message);
    });

    // ─── 注入 NovelCreator 模块（通过 executeJavaScript）─────────
    const NC_MANIFEST = require('./scripts/manifest');
    const NC_PATH = require('path');
    const NC_FS = require('fs');
    const ROOT_DIR = __dirname;
    log('NC', 'ROOT_DIR=' + ROOT_DIR + ' manifest.srcDir=' + NC_MANIFEST.srcDir);
    const srcDir = NC_PATH.resolve(ROOT_DIR, NC_MANIFEST.srcDir);
    log('NC', 'srcDir=' + srcDir);

    function stripUserscriptHeader(code) {
      return code.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/m, '').trim();
    }
    function unwrapIIFE(code) {
      return code
        .replace(/^\s*\(?\s*function\s*(\([^)]*\)|\w*)\s*\{\s*'?use strict'?;?\s*/m, '')
        .replace(/\}\)\s*\(\s*\);\s*$/, '');
    }

    // 读取所有模块并拼接
    const moduleCodeParts = [];
    const modules = NC_MANIFEST.modules || [];
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      if (!mod) { log('NC', '跳过空模块 index=' + i); continue; }
      const filePath = NC_PATH.join(srcDir, mod);
      let code = '';
      try {
        code = NC_FS.readFileSync(filePath, 'utf8');
      } catch(e) {
        log('NC', '读取模块失败 ' + mod + ': ' + e.message);
        continue;
      }
      code = stripUserscriptHeader(code);
      code = unwrapIIFE(code);
      moduleCodeParts.push(code);
    }
    const coreCode = moduleCodeParts.join('\n\n');
    log('NC', '已读取 ' + moduleCodeParts.length + ' 个模块，总计 ' + coreCode.length + ' 字符');

    // CDN 降级
    const depCdnList = (NC_MANIFEST.externalDeps || [])
      .map(d => ({ name: d.name, url: d.cdn }))
      .filter(d => d.local && !NC_FS.existsSync(NC_PATH.join(ROOT_DIR, d.local)));

    // 注入 bootstrap（main world）
    function injectBootstrap() {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      const depsJson = JSON.stringify(depCdnList);
      const bootstrap = '(function() {\n' +
        "  'use strict';\n" +
        '\n' +
        "  function loadScript(url) {\n" +
        "    return new Promise(function(resolve, reject) {\n" +
        "      var s = document.createElement('script');\n" +
        "      s.src = url;\n" +
        "      s.onload = resolve;\n" +
        "      s.onerror = function() { reject(new Error('CDN 加载失败: ' + url)); };\n" +
        "      document.head.appendChild(s);\n" +
        "    });\n" +
        "  }\n" +
        '\n' +
        "  function waitFor(checkFn, timeout, label) {\n" +
        "    return new Promise(function(resolve, reject) {\n" +
        "      var start = Date.now();\n" +
        "      var timer = setInterval(function() {\n" +
        "        try {\n" +
        "          if (checkFn()) {\n" +
        "            clearInterval(timer);\n" +
        "            resolve();\n" +
        "          } else if (Date.now() - start > timeout) {\n" +
        "            clearInterval(timer);\n" +
        "            reject(new Error(label + ' 超时'));\n" +
        "          }\n" +
        "        } catch(e) {\n" +
        "          clearInterval(timer);\n" +
        "          reject(e);\n" +
        "        }\n" +
        "      }, 500);\n" +
        "    });\n" +
        "  }\n" +
        '\n' +
        "  async function main() {\n" +
        "    console.log('[NovelCreator] bootstrap 启动 (executeJavaScript 模式)');\n" +
        '\n' +
        "    var cdnList = " + depsJson + ";\n" +
        "    for (var i = 0; i < cdnList.length; i++) {\n" +
        "      console.log('[NovelCreator] 加载 CDN:', cdnList[i].name);\n" +
        "      await loadScript(cdnList[i].url);\n" +
        "    }\n" +
        '\n' +
        "    console.log('[NovelCreator] 等待 SillyTavern...');\n" +
        "    await waitFor(function() {\n" +
        "      return typeof window.SillyTavern !== 'undefined' && typeof window.SillyTavern.getContext === 'function';\n" +
        "    }, 120000, 'SillyTavern');\n" +
        "    console.log('[NovelCreator] SillyTavern 就绪');\n" +
        '\n' +
        "    console.log('[NovelCreator] 等待 TavernHelper...');\n" +
        "    await waitFor(function() {\n" +
        "      return typeof window.TavernHelper !== 'undefined' &&\n" +
        "             typeof window.TavernHelper.getWorldbook         === 'function' &&\n" +
        "             typeof window.TavernHelper.updateWorldbookWith === 'function' &&\n" +
        "             typeof window.TavernHelper.generate            === 'function' &&\n" +
        "             typeof window.TavernHelper.triggerSlash        === 'function' &&\n" +
        "             typeof window.TavernHelper.stopAllGeneration   === 'function';\n" +
        "    }, 120000, 'TavernHelper');\n" +
        "    console.log('[NovelCreator] TavernHelper 就绪');\n" +
        '\n' +
        "    console.log('[NovelCreator] 注入核心模块...');\n" +
        "    var s = document.createElement('script');\n" +
        "    s.id = 'novel-creator-modules';\n" +
        "    s.textContent = " + JSON.stringify(coreCode) + ";\n" +
        "    document.head.appendChild(s);\n" +
        "    console.log('[NovelCreator] 核心模块注入成功');\n" +
        "  }\n" +
        '\n' +
        "  main().catch(function(err) {\n" +
        "    console.error('[NovelCreator] 错误:', err.message);\n" +
        "  });\n" +
        "})();\n";

      const escaped = JSON.stringify(bootstrap);
      const js = 'try { eval(' + escaped + '); } catch(e) { console.error("[NovelCreator] eval 失败:", e.message); }';
      mainWindow.webContents.executeJavaScript(js).catch(e => {
        log('NC', 'bootstrap 注入失败: ' + e.message);
      });
    }

    // 等待页面稳定后（3s）再注入
    setTimeout(injectBootstrap, 3000);
    log('NC', '计划 3s 后注入 bootstrap');

  });

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

    // 1. 检测/下载 Node.js
    setSplashStatus('检测系统环境...');
    const systemNode = downloader.detectSystemNode();

    if (systemNode) {
      systemNodePath = systemNode.path;
      log('Setup', `使用系统 Node.js: ${systemNode.version} @ ${systemNode.path}`);
      setSplashStatus('使用系统 Node.js');
    } else if (isDev) {
      log('Setup:ERR', '开发模式需要系统安装 Node.js (>= v18)');
      throw new Error('开发模式需要系统安装 Node.js (>= v18)');
    } else {
      log('Setup', '系统未检测到 Node.js，准备下载...');
      setSplashStatus('下载 Node.js...');
      const nodeBin = await downloader.downloadNode(NODE_DIR, DOWNLOAD_DIR, (msg) => {
        log('Download', msg);
        setSplashStatus(msg);
      });
      if (!nodeBin) {
        throw new Error('Node.js 下载失败');
      }
      systemNodePath = nodeBin;
    }

    // 2. 下载/检查 SillyTavern
    setSplashStatus('检查 SillyTavern...');
    if (isDev && !fs.existsSync(ST_SERVER)) {
      throw new Error(`开发模式：找不到 SillyTavern\n路径: ${ST_SERVER}\n请先运行: npm run setup`);
    }
    const stSuccess = await downloader.downloadSillyTavern(ST_DIR, DOWNLOAD_DIR, (msg) => {
      log('Setup', msg);
      setSplashStatus(msg);
    });
    if (!stSuccess && !fs.existsSync(ST_SERVER)) {
      throw new Error('SillyTavern 下载失败');
    }

    // 3. 安装依赖
    if (!isDev) {
      setSplashStatus('安装依赖...');
      await downloader.installDependencies(ST_DIR, systemNodePath, 'https://registry.npmmirror.com', (msg) => {
        log('npm', msg);
        setSplashStatus(msg);
      });
    }

    // 4. 下载酒馆助手
    if (!isDev) {
      setSplashStatus('检查酒馆助手...');
      await downloader.downloadTavernHelper(ST_DIR, DOWNLOAD_DIR, (msg) => {
        log('Setup', msg);
        setSplashStatus(msg);
      });
    }

    // 5. 下载 CDN 依赖
    if (!isDev) {
      setSplashStatus('下载前端依赖...');
      await downloader.downloadVendorDeps(VENDOR_DIR, (msg) => {
        log('Download', msg);
        setSplashStatus(msg);
      });
    }

    // 6. 创建配置
    downloader.createDefaultConfig(ST_DIR, ST_PORT);

    // 6. 启动 SillyTavern
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

// 渲染进程 → 主进程：模块加载进度（来自 preload 注入的 electronAPI.reportModuleProgress）
ipcMain.on('module-progress', (event, { current, total, name }) => {
  log('NC', `加载模块 (${current}/${total}): ${name}`);
});

// 渲染进程 → 主进程：通用日志消息
ipcMain.on('nc-log', (event, msg) => {
  log('NC', msg);
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
