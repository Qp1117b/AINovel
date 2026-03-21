/**
 * main.js — Electron 主进程
 * 职责：
 *   1. 找到打包内的 SillyTavern 路径
 *   2. 用独立 Node.js 启动 ST 服务器子进程
 *   3. 等待 ST 就绪后创建 BrowserWindow
 *   4. BrowserWindow 加载 http://127.0.0.1:8000
 *   5. preload.js 负责注入酒馆助手 + auto.js
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const http = require('http');
const fs = require('fs');

// ─── 路径解析工具 ─────────────────────────────────────────────
/**
 * 无论是开发环境还是打包后 asar，都能正确定位 extraResources 目录
 * 打包后：resources/sillytavern/  resources/node/  resources/auto.js
 * 开发时：./sillytavern/           ./node/           ./auto.js
 */
function getResourcePath(...parts) {
  const base = app.isPackaged
    ? process.resourcesPath          // 打包后的 resources 目录
    : path.join(__dirname);          // 开发时的项目根目录
  return path.join(base, ...parts);
}

// ─── 配置常量 ─────────────────────────────────────────────────
const ST_PORT     = 8000;
const ST_DIR      = getResourcePath('sillytavern');
const NODE_BIN    = getResourcePath('node', process.platform === 'win32' ? 'node.exe' : 'node');
const ST_SERVER   = path.join(ST_DIR, 'server.js');
const AUTO_JS     = getResourcePath('auto.js');
const PRELOAD_JS  = path.join(__dirname, 'preload.js');  // preload 不打入 asar

let mainWindow = null;
let stProcess  = null;

// ─── 日志工具 ─────────────────────────────────────────────────
function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][${tag}] ${msg}`);
}

// ─── 等待 ST 服务器响应 ────────────────────────────────────────
function waitForST(maxRetries = 60, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${ST_PORT}`, (res) => {
        if (res.statusCode < 500) {
          log('ST', `服务就绪 (HTTP ${res.statusCode})，共等待 ${tries}s`);
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(800, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (++tries >= maxRetries) {
        reject(new Error(`SillyTavern 在 ${maxRetries}s 内未能启动`));
      } else {
        setTimeout(check, intervalMs);
      }
    };
    check();
  });
}

// ─── 启动 SillyTavern 子进程 ────────────────────────────────────
function launchSillyTavern() {
  return new Promise((resolve, reject) => {
    // 校验关键文件是否存在
    if (!fs.existsSync(ST_SERVER)) {
      return reject(new Error(`找不到 SillyTavern server.js:\n${ST_SERVER}`));
    }
    if (!fs.existsSync(NODE_BIN)) {
      return reject(new Error(`找不到 Node.js 可执行文件:\n${NODE_BIN}\n请确保已将 Node.js 放入 resources/node/`));
    }

    log('ST', `启动 SillyTavern: ${NODE_BIN} ${ST_SERVER}`);
    log('ST', `工作目录: ${ST_DIR}`);

    stProcess = spawn(NODE_BIN, [ST_SERVER, '--port', String(ST_PORT), '--no-csrf'], {
      cwd: ST_DIR,
      env: {
        ...process.env,
        PORT: String(ST_PORT),
        NODE_ENV: 'production',
        // 禁止 ST 自动打开浏览器
        ST_OPEN_BROWSER: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    stProcess.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) log('ST', line);
      // ST 输出 "SillyTavern is listening" 时也可以直接 resolve
      if (line.includes('SillyTavern is listening') || line.includes('Listening on')) {
        resolve();
      }
    });

    stProcess.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) log('ST:ERR', line);
    });

    stProcess.on('error', (err) => {
      log('ST', `子进程错误: ${err.message}`);
      reject(err);
    });

    stProcess.on('exit', (code, signal) => {
      log('ST', `子进程退出 code=${code} signal=${signal}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(
          `alert('SillyTavern 服务意外退出 (code=${code})，请重启应用')`, true
        ).catch(() => {});
      }
    });

    // 无论是否收到监听信号，都通过 waitForST 轮询确认
    setTimeout(resolve, 500); // 给子进程 500ms 启动时间后开始轮询
  });
}

// ─── 创建主窗口 ────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '自动化小说创作系统',
    backgroundColor: '#1a1a2e',
    show: false,   // 等待 ready-to-show 再显示，避免白屏
    webPreferences: {
      preload: PRELOAD_JS,
      nodeIntegration: false,         // 安全：禁用 Node 直接访问
      contextIsolation: true,         // 安全：隔离上下文
      webSecurity: true,
      sandbox: false,                 // preload 需要访问 fs
      allowRunningInsecureContent: false,
    },
  });

  // 加载 SillyTavern 页面
  mainWindow.loadURL(`http://127.0.0.1:${ST_PORT}`);

  // 就绪后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('Window', '主窗口已显示');
  });

  // 在应用内拦截外部链接，用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${ST_PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── 加载进度窗口（启动画面） ───────────────────────────────────
function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <style>
      body {
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: rgba(18,18,35,0.95);
        color: #a78bfa;
        font-family: "Microsoft YaHei", sans-serif;
        border-radius: 16px;
        border: 1px solid rgba(167,139,250,0.3);
        -webkit-app-region: drag;
      }
      h2 { font-size: 20px; margin: 0 0 8px; color: #e2e8f0; }
      p  { font-size: 13px; margin: 0 0 24px; color: #94a3b8; }
      .spinner {
        width: 40px; height: 40px;
        border: 3px solid rgba(167,139,250,0.2);
        border-top-color: #a78bfa;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    </head>
    <body>
      <h2>自动化小说创作系统</h2>
      <p>正在启动 SillyTavern 环境…</p>
      <div class="spinner"></div>
    </body>
    </html>
  `);

  return splash;
}

// ─── 应用入口 ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('App', `启动，平台: ${process.platform}，版本: ${app.getVersion()}`);
  log('App', `资源路径: ${getResourcePath()}`);

  const splash = createSplashWindow();

  try {
    // 1. 启动 SillyTavern
    await launchSillyTavern();

    // 2. 等待 HTTP 服务就绪
    await waitForST();

    // 3. 创建主窗口
    createWindow();

    // 4. 关闭启动画面
    splash.close();
  } catch (err) {
    log('App', `启动失败: ${err.message}`);
    splash.close();
    await dialog.showErrorBox('启动失败', `${err.message}\n\n请检查 resources/sillytavern 和 resources/node 目录是否完整。`);
    app.quit();
  }
});

// ─── IPC：渲染进程可调用 ────────────────────────────────────────
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('open-devtools', () => {
  if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
});

// ─── 生命周期 ──────────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (stProcess && !stProcess.killed) {
    log('App', '关闭 SillyTavern 子进程');
    stProcess.kill('SIGTERM');
    // Windows 需要额外强制结束
    if (process.platform === 'win32') {
      try {
        execFile('taskkill', ['/F', '/T', '/PID', String(stProcess.pid)]);
      } catch (_) {}
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
