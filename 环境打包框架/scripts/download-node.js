#!/usr/bin/env node
/**
 * scripts/download-node.js
 *
 * 自动下载 Windows x64 便携版 Node.js 到 resources/node/node.exe
 * 执行：node scripts/download-node.js
 */

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const zlib    = require('zlib');
const { execSync } = require('child_process');

const NODE_VERSION = '20.18.1';   // LTS，与 ST 官方要求兼容
const DEST_DIR  = path.resolve(__dirname, '..', 'resources', 'node');
const DEST_FILE = path.join(DEST_DIR, 'node.exe');

// Node.js 官方下载 URL（Windows x64 独立可执行文件）
const NODE_EXE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

// 国内镜像备用
const MIRROR_URL = `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/win-x64/node.exe`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadWithProgress(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(dest + '.tmp');
    let downloaded = 0, total = 0;
    let lastPrint = 0;

    console.log(`下载: ${url}`);

    const req = proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest + '.tmp');
        return downloadWithProgress(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        if (total > 0 && Date.now() - lastPrint > 1000) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          const mb  = (downloaded / 1024 / 1024).toFixed(1);
          const tot = (total    / 1024 / 1024).toFixed(1);
          process.stdout.write(`\r  进度: ${pct}% (${mb}MB / ${tot}MB)`);
          lastPrint = Date.now();
        }
      });
      res.on('end', () => {
        file.close(() => {
          process.stdout.write('\n');
          fs.renameSync(dest + '.tmp', dest);
          resolve();
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('下载超时')); });
  });
}

(async () => {
  console.log(`\n准备 Node.js v${NODE_VERSION} (Windows x64 便携版)`);
  console.log(`目标路径: ${DEST_FILE}\n`);

  if (fs.existsSync(DEST_FILE)) {
    // 检查版本
    try {
      const v = execSync(`"${DEST_FILE}" --version`, { stdio: 'pipe' }).toString().trim();
      console.log(`✅ 已存在: ${v}，无需重新下载`);
      process.exit(0);
    } catch (_) {
      console.log('⚠️ 现有 node.exe 无法运行，重新下载…');
    }
  }

  ensureDir(DEST_DIR);

  try {
    await downloadWithProgress(NODE_EXE_URL, DEST_FILE);
    console.log('✅ node.exe 下载完成');
  } catch (e) {
    console.log(`官方下载失败 (${e.message})，尝试镜像…`);
    try {
      await downloadWithProgress(MIRROR_URL, DEST_FILE);
      console.log('✅ node.exe 下载完成（镜像）');
    } catch (e2) {
      console.error('❌ 两个源都下载失败:', e2.message);
      console.error('\n请手动下载：');
      console.error(`  ${NODE_EXE_URL}`);
      console.error(`并放到: ${DEST_FILE}`);
      process.exit(1);
    }
  }

  // 验证
  try {
    const v = execSync(`"${DEST_FILE}" --version`, { stdio: 'pipe' }).toString().trim();
    console.log(`验证通过: ${v}`);
    console.log('\n现在可以运行打包了：');
    console.log('  npm run build:win\n');
  } catch (e) {
    console.error('⚠️ 验证失败:', e.message);
  }
})();
