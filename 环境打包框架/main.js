/**
 * main.js — Electron 主进程
 */

if (process.platform === 'win32') {
  try { require('child_process').execSync('chcp 65001', { stdio: 'ignore', shell: true }); } catch (_) { }
}

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');

// ─── 路径 ─────────────────────────────────────────────────────
function getResourcePath(...parts) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
  return path.join(base, ...parts);
}

const ST_PORT = 8000;
const ST_DIR = getResourcePath('sillytavern');
const NODE_BIN = getResourcePath('node', process.platform === 'win32' ? 'node.exe' : 'node');
const ST_SERVER = path.join(ST_DIR, 'server.js');
const ST_CONFIG = path.join(ST_DIR, 'config.yaml');
const PRELOAD_JS = path.join(__dirname, 'preload.js');
const SPLASH_HTML = path.join(__dirname, 'splash.html');

// PID 文件：userData 目录，重启后仍可读
const PID_FILE = path.join(app.getPath('userData'), 'st-process.pid');

let mainWindow = null;
let splashWindow = null;
let stProcess = null;

function log(tag, msg) {
  console.log(`[${new Date().toISOString().slice(11, 23)}][${tag}] ${String(msg)}`);
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

// ─── 按端口杀进程（兜底） ─────────────────────────────────────
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

// ─── 强制写入 ST config.yaml 禁止自动打开浏览器 ───────────────
// 每次启动前调用，不依赖 setup.js 的一次性 patch
function patchSTConfig() {
  try {
    let content = '';
    if (fs.existsSync(ST_CONFIG)) {
      content = fs.readFileSync(ST_CONFIG, 'utf8');
      // 修改已存在的字段
      content = content.replace(/^autorun\s*:.+$/m, 'autorun: false');
      content = content.replace(/^whitelistMode\s*:.+$/m, 'whitelistMode: false');
      // 如果字段不存在，追加到文件末尾
      if (!/^autorun\s*:/m.test(content)) content += '\nautorun: false';
      if (!/^whitelistMode\s*:/m.test(content)) content += '\nwhitelistMode: false';
    } else {
      // 没有配置文件，创建最小配置
      fs.mkdirSync(path.dirname(ST_CONFIG), { recursive: true });
      content = 'listen: true\nport: 8000\nautorun: false\nwhitelistMode: false\ndisableCsrf: true\n';
    }
    fs.writeFileSync(ST_CONFIG, content, 'utf8');
    log('App', 'ST config.yaml 已确保 autorun: false');
  } catch (e) {
    log('App', `修改 ST config 失败: ${e.message}`);
  }
}

// ─── 更新启动画面状态文字 ───────────────────────────────────────
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
    if (!fs.existsSync(NODE_BIN)) {
      return reject(new Error(`找不到 Node.js:\n${NODE_BIN}\n\n请运行: node scripts/download-node.js`));
    }
    if (!fs.existsSync(ST_SERVER)) {
      return reject(new Error(`找不到 SillyTavern:\n${ST_SERVER}\n\n请运行: npm run setup`));
    }

    // 每次启动前强制 patch 配置
    patchSTConfig();

    log('ST', `Node:   ${NODE_BIN}`);
    log('ST', `Server: ${ST_SERVER}`);

    stProcess = spawn(NODE_BIN, [ST_SERVER, '--port', String(ST_PORT), '--no-csrf'], {
      cwd: ST_DIR,
      env: {
        ...process.env,
        PORT: String(ST_PORT),
        NODE_ENV: 'production',
        // 这两个环境变量 ST 可能不认，但加上无害
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
    stProcess.stderr.on('data', (d) => { const l = d.toString('utf8').trim(); if (l) log('ST:ERR', l); });
    stProcess.on('error', (err) => reject(err));
    stProcess.on('exit', (code) => {
      log('ST', `子进程退出 code=${code}`);
      clearPID(); stProcess = null;
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
// 使用实体 HTML 文件，确保渲染可靠
function createSplashWindow() {
  return new Promise((resolve) => {
    splashWindow = new BrowserWindow({
      width: 440, height: 280,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: false,
      backgroundColor: '#080c18',
      show: false,           // 先不显示，等 ready-to-show 再显示
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    // ready-to-show 后再显示，确保内容已渲染
    splashWindow.once('ready-to-show', () => {
      splashWindow.show();
      log('Splash', '启动画面已显示');
      resolve();             // 画面显示后才继续启动流程
    });

    splashWindow.loadFile(SPLASH_HTML);
  });
}

// ─── 主窗口 ───────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: '自动化小说创作系统', backgroundColor: '#1a1a2e', show: false,
    webPreferences: {
      preload: PRELOAD_JS,
      nodeIntegration: false, contextIsolation: true,
      sandbox: false, webSecurity: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${ST_PORT}`);
  mainWindow.once('ready-to-show', () => { mainWindow.show(); log('Window', '主窗口已显示'); });
  // 在事件到达页面之前拦截，比 globalShortcut 更可靠
  // F12 或 Ctrl+Shift+I 切换 DevTools
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
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── 入口 ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('App', `平台: ${process.platform} | 打包: ${app.isPackaged}`);
  log('App', `splash.html: ${SPLASH_HTML} | 存在: ${fs.existsSync(SPLASH_HTML)}`);

  cleanupOrphanProcess();

  // 先等启动画面真正显示出来，再开始启动 ST
  await createSplashWindow();

  try {
    await launchSillyTavern();
    await waitForST();
    createWindow();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  } catch (err) {
    log('App', `启动失败: ${err.message}`);
    killST();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    await dialog.showErrorBox('启动失败', err.message);
    app.quit();
  }
});

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('open-devtools', () => { if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' }); });

app.on('before-quit', () => { killST(); });
app.on('will-quit', () => { killST(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

process.on('SIGINT', () => { killST(); process.exit(0); });
process.on('SIGTERM', () => { killST(); process.exit(0); });
process.on('uncaughtException', (err) => { log('App', `未捕获异常: ${err.message}`); killST(); process.exit(1); });

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });