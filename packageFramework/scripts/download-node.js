#!/usr/bin/env node
/**
 * scripts/download-node.js
 *
 * 下载 Windows x64 便携版 node.exe 到 resources/node/node.exe
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NODE_VERSION = '20.18.1';
const DEST_DIR = path.resolve(__dirname, '..', 'resources', 'node');  // ← resources/node/
const DEST_FILE = path.join(DEST_DIR, 'node.exe');

const URLS = [
  `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`,
  `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/win-x64/node.exe`,
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadWithProgress(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest + '.tmp');
    let downloaded = 0, total = 0, lastPrint = 0;

    console.log(`\n下载: ${url}`);
    const req = proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); try { fs.unlinkSync(dest + '.tmp'); } catch (_) { }
        return downloadWithProgress(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        if (Date.now() - lastPrint > 1000) {
          const pct = total > 0 ? ((downloaded / total) * 100).toFixed(1) + '%' : `${(downloaded / 1024 / 1024).toFixed(1)}MB`;
          process.stdout.write(`\r  进度: ${pct}`);
          lastPrint = Date.now();
        }
      });
      res.on('end', () => {
        file.close(() => { process.stdout.write('\n'); fs.renameSync(dest + '.tmp', dest); resolve(); });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('超时')); });
  });
}

(async () => {
  console.log(`\n准备 Node.js v${NODE_VERSION} (Windows x64)`);
  console.log(`目标: ${DEST_FILE}`);

  if (fs.existsSync(DEST_FILE)) {
    try {
      const v = execSync(`"${DEST_FILE}" --version`, { stdio: 'pipe' }).toString().trim();
      console.log(`\n✅ 已存在: ${v}，无需重新下载`);
      process.exit(0);
    } catch (_) { console.log('⚠️ 已存在但无法运行，重新下载...'); }
  }

  ensureDir(DEST_DIR);

  for (const url of URLS) {
    try {
      await downloadWithProgress(url, DEST_FILE);
      const v = execSync(`"${DEST_FILE}" --version`, { stdio: 'pipe' }).toString().trim();
      console.log(`\n✅ 下载完成: ${v}`);
      console.log(`路径: ${DEST_FILE}`);
      console.log('\n现在可以运行: npm start\n');
      process.exit(0);
    } catch (e) {
      console.log(`\n❌ 失败(${e.message})，尝试下一个源...`);
      try { fs.unlinkSync(DEST_FILE + '.tmp'); } catch (_) { }
    }
  }

  console.error('\n❌ 所有下载源均失败，请手动下载：');
  console.error(`  ${URLS[0]}`);
  console.error(`放到: ${DEST_FILE}`);
  process.exit(1);
})();