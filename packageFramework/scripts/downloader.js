/**
 * scripts/downloader.js
 *
 * 统一下载模块，开发和打包共用
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ─── 下载地址 ─────────────────────────────────────────────────
const DOWNLOAD_URLS = {
  sillytavern: [
    'https://ghproxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
    'https://gh-proxy.com/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
    'https://ghps.cc/https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
    'https://github.com/SillyTavern/SillyTavern/archive/refs/heads/release.zip',
  ],
  tavernHelper: [
    'https://ghproxy.com/https://github.com/N0VI028/JS-Slash-Runner/archive/refs/heads/main.zip',
    'https://github.com/N0VI028/JS-Slash-Runner/archive/refs/heads/main.zip',
  ],
  node: [
    'https://npmmirror.com/mirrors/node/v20.18.1/node-v20.18.1-win-x64.zip',
    'https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip',
  ],
};

// ─── 检测系统 Node.js ─────────────────────────────────────────
function detectSystemNode() {
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
          return { version, path: nodePath };
        }
      }
    }
  } catch (_) { }
  return null;
}

// ─── 下载文件 ─────────────────────────────────────────────────
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const tmpDest = dest + '.tmp';
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let downloaded = 0;
    let total = 0;

    const doRequest = (requestUrl) => {
      const req = proto.get(requestUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
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

// ─── 解压 ZIP ─────────────────────────────────────────────────
function extractZip(zipPath, destDir, downloadDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const psScript = path.join(downloadDir || path.dirname(destDir), '_extract.ps1');
  fs.writeFileSync(psScript, `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`);
  execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: 'pipe' });
  try { fs.unlinkSync(psScript); } catch (_) { }
}

// ─── 下载并解压通用函数 ───────────────────────────────────────
async function downloadAndExtract(name, urls, targetDir, downloadDir, onProgress) {
  const zipPath = path.join(downloadDir, `${name}.zip`);
  const extractDir = path.join(downloadDir, `${name}-extract`);

  // 如果 zip 文件已存在，直接解压
  if (fs.existsSync(zipPath)) {
    if (onProgress) onProgress(`发现已下载的 ${name}.zip，直接解压...`);
    try {
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      extractZip(zipPath, extractDir, downloadDir);

      const folders = fs.readdirSync(extractDir);
      if (folders.length > 0) {
        try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (_) { }
        fs.renameSync(path.join(extractDir, folders[0]), targetDir);
      }

      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      // 保留 zip 文件，不删除
      return true;
    } catch (e) {
      console.log(`⚠️ ${name} 解压失败: ${e.message}，重新下载...`);
      try { fs.unlinkSync(zipPath); } catch (_) { }
    }
  }

  for (const url of urls) {
    try {
      if (onProgress) onProgress(`下载 ${name}: ${url}`);
      await downloadFile(url, zipPath, (current, total, pct) => {
        if (onProgress) onProgress(`下载 ${name}: ${pct}% (${(current / 1024 / 1024).toFixed(1)}MB)`);
      });

      if (onProgress) onProgress(`解压 ${name}...`);
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      extractZip(zipPath, extractDir, downloadDir);

      // 找到解压后的目录并移动
      const folders = fs.readdirSync(extractDir);
      if (folders.length > 0) {
        // 先删除目标目录
        try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (_) { }
        fs.renameSync(path.join(extractDir, folders[0]), targetDir);
      }

      // 清理解压目录，保留 zip 文件
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }

      return true;
    } catch (e) {
      // 下载失败时删除损坏的 zip
      try { fs.unlinkSync(zipPath); } catch (_) { }
      console.log(`⚠️ ${name} 下载失败: ${e.message}`);
    }
  }

  return false;
}

// ─── 下载 SillyTavern ─────────────────────────────────────────
async function downloadSillyTavern(targetDir, downloadDir, onProgress) {
  // 检查是否已存在
  if (fs.existsSync(path.join(targetDir, 'server.js'))) {
    if (onProgress) onProgress('SillyTavern 已存在');
    return true;
  }

  if (onProgress) onProgress('开始下载 SillyTavern...');
  return await downloadAndExtract('sillytavern', DOWNLOAD_URLS.sillytavern, targetDir, downloadDir, onProgress);
}

// ─── 下载酒馆助手 ─────────────────────────────────────────────
async function downloadTavernHelper(stDir, downloadDir, onProgress) {
  const extDir = path.join(stDir, 'public', 'scripts', 'extensions', 'third-party');
  const helperDir = path.join(extDir, 'JS-Slash-Runner');

  // 检查是否已存在
  if (fs.existsSync(path.join(helperDir, 'package.json'))) {
    if (onProgress) onProgress('酒馆助手已存在');
    return true;
  }

  if (onProgress) onProgress('开始下载酒馆助手...');
  const success = await downloadAndExtract('tavern-helper', DOWNLOAD_URLS.tavernHelper, helperDir, downloadDir, onProgress);

  if (success) {
    // 启用酒馆助手
    const extStateDir = path.join(stDir, 'data', 'default-user', 'extensions');
    if (!fs.existsSync(extStateDir)) fs.mkdirSync(extStateDir, { recursive: true });
    fs.writeFileSync(path.join(extStateDir, 'JS-Slash-Runner.json'), JSON.stringify({ enabled: true }, null, 2));
  }

  return success;
}

// ─── 下载 Node.js ─────────────────────────────────────────────
async function downloadNode(targetDir, downloadDir, onProgress) {
  const nodeBin = path.join(targetDir, 'node.exe');

  // 检查是否已存在
  if (fs.existsSync(nodeBin)) {
    try {
      const { execSync } = require('child_process');
      const v = execSync(`"${nodeBin}" --version`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (onProgress) onProgress(`Node.js 已存在: ${v}`);
      return nodeBin;
    } catch (_) { }
  }

  if (onProgress) onProgress('开始下载 Node.js...');

  const zipPath = path.join(downloadDir, 'node.zip');
  const extractDir = path.join(downloadDir, 'node-extract');

  for (const url of DOWNLOAD_URLS.node) {
    try {
      if (onProgress) onProgress(`下载 Node.js: ${url}`);
      await downloadFile(url, zipPath, (current, total, pct) => {
        if (onProgress) onProgress(`下载 Node.js: ${pct}% (${(current / 1024 / 1024).toFixed(1)}MB)`);
      });

      if (onProgress) onProgress('解压 Node.js...');
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      extractZip(zipPath, extractDir, downloadDir);

      // 移动文件到目标目录
      const folders = fs.readdirSync(extractDir).filter(f => f.startsWith('node-v'));
      if (folders.length > 0) {
        const extractedDir = path.join(extractDir, folders[0]);
        const files = fs.readdirSync(extractedDir);
        for (const file of files) {
          const src = path.join(extractedDir, file);
          const dest = path.join(targetDir, file);
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

      // 清理
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { }
      try { fs.unlinkSync(zipPath); } catch (_) { }

      // 验证
      const { execSync } = require('child_process');
      const v = execSync(`"${nodeBin}" --version`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (onProgress) onProgress(`Node.js 安装成功: ${v}`);
      return nodeBin;
    } catch (e) {
      try { fs.unlinkSync(zipPath); } catch (_) { }
      console.log(`⚠️ Node.js 下载失败: ${e.message}`);
    }
  }

  return null;
}

// ─── 安装 npm 依赖 ────────────────────────────────────────────
async function installDependencies(cwd, nodeBin, registry, onProgress) {
  const { spawn } = require('child_process');
  const nodeModulesDir = path.join(cwd, 'node_modules');

  if (fs.existsSync(nodeModulesDir)) {
    if (onProgress) onProgress('依赖已存在，跳过安装');
    return true;
  }

  if (onProgress) onProgress('安装依赖...');

  return new Promise((resolve, reject) => {
    // 检测是否使用系统 node（通过 detectSystemNode 获取的路径）
    const systemNode = detectSystemNode();
    const isSystemNode = systemNode && systemNode.path === nodeBin;

    let npmCmd, npmArgs;
    
    if (isSystemNode) {
      // 系统 node：直接用 npm
      npmCmd = 'npm';
    } else {
      // 下载的 node：用 node npm-cli.js
      npmCmd = nodeBin;
      npmArgs = ['npm'];
    }
    
    npmArgs = (npmArgs || []).concat(['install', '--omit=dev', '--registry', registry || 'https://registry.npmmirror.com']);

    const npmProcess = spawn(npmCmd, npmArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // 确保下载的 node 目录在 PATH 中
        PATH: isSystemNode ? process.env.PATH : `${path.dirname(nodeBin)};${process.env.PATH}`
      }
    });

    npmProcess.stdout.on('data', (d) => {
      const line = d.toString('utf8').trim();
      if (line && onProgress) onProgress(line);
    });

    npmProcess.stderr.on('data', (d) => {
      const line = d.toString('utf8').trim();
      if (line) console.error(line);
    });

    npmProcess.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`npm install 退出码: ${code}`));
      }
    });

    npmProcess.on('error', (e) => {
      reject(new Error(`npm install 失败: ${e.message}`));
    });
  });
}

// ─── 创建默认配置 ─────────────────────────────────────────────
function createDefaultConfig(stDir, port) {
  // 创建 default/config.yaml
  const defaultCfgDir = path.join(stDir, 'default');
  if (!fs.existsSync(defaultCfgDir)) fs.mkdirSync(defaultCfgDir, { recursive: true });
  const defaultCfgPath = path.join(defaultCfgDir, 'config.yaml');
  if (!fs.existsSync(defaultCfgPath)) {
    fs.writeFileSync(defaultCfgPath, `# SillyTavern Default Configuration Template
      listen: true
      port: ${port || 8000}
      whitelistMode: false
      autorun: false
      enableExtensions: true
      `);
  }

  // 创建或修改 config.yaml
  const cfgPath = path.join(stDir, 'config.yaml');
  if (fs.existsSync(cfgPath)) {
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    cfg = cfg.replace(/^autorun\s*:.+$/m, 'autorun: false');
    cfg = cfg.replace(/^whitelistMode\s*:.+$/m, 'whitelistMode: false');
    cfg = cfg.replace(/^port\s*:.+$/m, `port: ${port || 8000}`);
    if (!/^autorun\s*:/m.test(cfg)) cfg += '\nautorun: false';
    if (!/^whitelistMode\s*:/m.test(cfg)) cfg += '\nwhitelistMode: false';
    if (!/^port\s*:/m.test(cfg)) cfg += `\nport: ${port || 8000}`;
    fs.writeFileSync(cfgPath, cfg);
  } else {
    fs.writeFileSync(cfgPath,
      `listen: true\nport: ${port || 8000}\nwhitelistMode: false\nautorun: false\ndisableCsrf: true\n`);
  }
}

// ─── CDN 依赖列表 ─────────────────────────────────────────────
const CDN_DEPS = [
  { url: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js', file: 'marked.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', file: 'jszip.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/gpt-tokenizer@latest/dist/cl100k_base.js', file: 'gpt-tokenizer.js' },
];

// ─── 下载 CDN 依赖 ────────────────────────────────────────────
async function downloadVendorDeps(vendorDir, onProgress) {
  if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir, { recursive: true });

  for (const dep of CDN_DEPS) {
    const dest = path.join(vendorDir, dep.file);
    if (fs.existsSync(dest)) {
      continue;
    }
    try {
      if (onProgress) onProgress(`下载 ${dep.file}...`);
      await downloadFile(dep.url, dest);
      if (onProgress) onProgress(`${dep.file} 完成`);
    } catch (e) {
      if (onProgress) onProgress(`${dep.file} 失败，运行时降级使用 CDN`);
    }
  }
}

module.exports = {
  DOWNLOAD_URLS,
  CDN_DEPS,
  detectSystemNode,
  downloadFile,
  extractZip,
  downloadSillyTavern,
  downloadTavernHelper,
  downloadNode,
  installDependencies,
  createDefaultConfig,
  downloadVendorDeps,
};
