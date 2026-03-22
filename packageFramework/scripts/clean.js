#!/usr/bin/env node
/**
 * scripts/clean.js
 *
 * 清理项目，只保留指定文件，其他全部删除
 * 运行: npm run clean
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 保留的文件（白名单）
const KEEP_FILES = [
  'main.js',
  'preload.js',
  'auto.js',
  'splash.html',
  'package.json',
  'README.md',
  'launcher.bat',
  'dev.bat',
];

// 保留的文件夹（白名单）
const KEEP_DIRS = [
  'scripts',
  'download'
];

function deleteItem(itemPath, isDir) {
  try {
    if (isDir) {
      fs.rmSync(itemPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(itemPath);
    }
    return true;
  } catch (e) {
    console.log(`  ✗ 无法删除: ${path.basename(itemPath)}`);
    return false;
  }
}

console.log('╔══════════════════════════════════════════╗');
console.log('║   清理项目                               ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// 获取根目录下所有项目
const items = fs.readdirSync(ROOT);
let deletedCount = 0;
let keptCount = 0;

for (const item of items) {
  const itemPath = path.join(ROOT, item);
  const isDir = fs.statSync(itemPath).isDirectory();

  // 检查是否在保留列表中
  if (isDir) {
    if (KEEP_DIRS.includes(item)) {
      console.log(`  ✓ 保留: ${item}/`);
      keptCount++;
      continue;
    }
  } else {
    if (KEEP_FILES.includes(item)) {
      console.log(`  ✓ 保留: ${item}`);
      keptCount++;
      continue;
    }
  }

  // 删除不在保留列表中的项目
  console.log(`  ✗ 删除: ${item}${isDir ? '/' : ''}`);
  if (deleteItem(itemPath, isDir)) {
    deletedCount++;
  }
}

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log(`║   清理完成！                              ║`);
console.log(`║   保留: ${keptCount} 个项目               ║`);
console.log(`║   删除: ${deletedCount} 个项目            ║`);
console.log('║                                           ║');
console.log('║   下一步：                                ║');
console.log('║   npm run setup   下载资源并初始化        ║');
console.log('╚══════════════════════════════════════════╝');
